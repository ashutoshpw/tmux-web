import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { accessSync, chmodSync, constants, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isLoopbackHost, parseListenHost, parseListenPort } from './listen-address.js';

export const SERVICE_NAME = 'tmux-web.service';
export const LAUNCH_AGENT_LABEL = 'com.ashutoshpw.tmux-web';
const STATE_FILE_NAME = 'service-state.json';
const OPERATION_LOCK_NAME = 'service-operation.lock';
const PENDING_FILE_NAME = 'service-restart-pending';
const TRANSACTION_FILE_NAME = 'service-install.transaction';

export type ServicePlatform = 'systemd' | 'launchd';

export type CommandResult = {
  code?: number;
  stdout?: string;
  stderr?: string;
};

export type CommandExecutor = (
  command: string,
  args: readonly string[],
) => CommandResult | Promise<CommandResult>;

export type ServiceFileStat = {
  uid: number;
  mode: number;
  isFile: boolean;
};

export type ServiceFileSystem = {
  readFile(file: string): string;
  writeFile(file: string, data: string, options?: { mode?: number; flag?: string }): void;
  mkdir(directory: string, options?: { recursive?: boolean; mode?: number }): void;
  rename(from: string, to: string): void;
  chmod(file: string, mode: number): void;
  stat(file: string): ServiceFileStat;
  unlink(file: string): void;
};

export type ExecutableResolver = (name: string, searchPath?: string) => string | undefined;

export type ServiceOptions = {
  home?: string;
  platform?: ServicePlatform;
  uid?: number;
  fs?: ServiceFileSystem;
  exec?: CommandExecutor;
  resolveExecutable?: ExecutableResolver;
  now?: () => number;
};

export type InstallOptions = {
  host: string;
  port: number;
  entryPath: string;
  runtimePath?: string;
  noStart?: boolean;
  force?: boolean;
  allowRemote?: boolean;
  tmuxPath?: string;
};

export type ServiceState = {
  schemaVersion: 1;
  platform: ServicePlatform;
  home: string;
  entryPath: string;
  runtimePath: string;
  host: string;
  port: number;
  allowRemote: boolean;
  unitPath: string;
  contentHash: string;
  ownerUid: number;
  installedAt: number;
};

export type StatusProblemCode =
  | 'not-installed'
  | 'missing-state'
  | 'invalid-state'
  | 'missing-unit'
  | 'ownership-mismatch'
  | 'hash-mismatch'
  | 'entry-missing'
  | 'entry-ephemeral'
  | 'platform-mismatch'
  | 'remote-not-allowed'
  | 'invalid-home'
  | 'invalid-entry-path'
  | 'missing-executable'
  | 'operation-locked'
  | 'already-installed'
  | 'activation-failed'
  | 'rollback'
  | 'invalid-platform'
  | 'root-user'
  | 'user-manager-unavailable'
  | 'service-disabled'
  | 'service-stopped';

export type ServiceStatus = {
  installed: boolean;
  active?: boolean;
  enabled?: boolean;
  pendingRestart?: boolean;
  problem?: StatusProblemCode;
  state?: ServiceState;
  unitPath: string;
  logPath: string;
};

export type ServiceRuntimeStatus = ServiceStatus & {
  awaitingLogin?: boolean;
};

export class ServiceManagerError extends Error {
  constructor(public readonly code: StatusProblemCode, message: string) {
    super(message);
    this.name = 'ServiceManagerError';
  }
}

const defaultFileSystem: ServiceFileSystem = {
  readFile: (file) => readFileSync(file, 'utf8'),
  writeFile: (file, data, options) => writeFileSync(file, data, { encoding: 'utf8', ...options }),
  mkdir: (directory, options) => mkdirSync(directory, options),
  rename: (from, to) => renameSync(from, to),
  chmod: (file, mode) => chmodSync(file, mode),
  stat: (file) => {
    const stat = statSync(file);
    return { uid: stat.uid, mode: stat.mode, isFile: stat.isFile() };
  },
  unlink: (file) => unlinkSync(file),
};

const defaultExecutor: CommandExecutor = (command, args) => {
  try {
    const stdout = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout: String(stdout) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return {
      code: typeof failure.status === 'number' ? failure.status : 1,
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? failure.message ?? 'command failed'),
    };
  }
};

const defaultExecutableResolver: ExecutableResolver = (name, searchPath = process.env.PATH ?? '') => {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return undefined;
};

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function escapeSystemd(value: string): string {
  return value.replaceAll('%', '%%');
}

function quoteSystemd(value: string): string {
  const escaped = escapeSystemd(value);
  if (!/[\s"'\\]/.test(escaped)) return escaped;
  return `"${escaped.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function validateHome(home: string): string {
  if (!path.isAbsolute(home) || path.resolve(home) !== home || home === path.parse(home).root) {
    throw new ServiceManagerError('invalid-home', 'home must be an absolute non-root path');
  }
  return home;
}

function isEphemeral(file: string): boolean {
  const resolved = path.resolve(file);
  const roots = [tmpdir(), '/tmp', '/var/tmp', '/private/tmp', '/run', '/var/run', '/dev/shm']
    .map((root) => path.resolve(root))
    .filter((root, index, values) => values.indexOf(root) === index);
  if (roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) return true;
  return resolved.includes(`${path.sep}.npm${path.sep}_npx${path.sep}`) || resolved.includes(`${path.sep}.bun${path.sep}install${path.sep}cache${path.sep}`);
}

function validateEntry(file: string, fs: ServiceFileSystem): void {
  if (!path.isAbsolute(file) || path.resolve(file) !== file || isEphemeral(file)) {
    throw new ServiceManagerError('invalid-entry-path', 'entry path must be an absolute non-ephemeral path');
  }
  let stat: ServiceFileStat;
  try {
    stat = fs.stat(file);
  } catch {
    throw new ServiceManagerError('missing-executable', 'entry executable does not exist');
  }
  if (!stat.isFile) throw new ServiceManagerError('missing-executable', 'entry path is not a file');
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function serviceEnvironment(input: InstallOptions, home: string): Record<string, string> {
  const runtimePath = input.runtimePath ?? process.execPath;
  const pathEntries = [
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.dirname(runtimePath),
    input.tmuxPath ? path.dirname(input.tmuxPath) : undefined,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0 && !hasControlCharacters(entry));
  const environment: Record<string, string> = {
    HOME: home,
    PATH: [...new Set(pathEntries)].join(path.delimiter),
    TMUX_WEB_MODE: 'production',
    // Lets the server cheaply detect that it runs under the service (settings
    // save then auto-restarts the unit). MainPID probing in service-runtime
    // covers units installed before this marker existed.
    TMUX_WEB_SERVICE: '1',
    TMUX_WEB_HOST: input.host,
    TMUX_WEB_PORT: String(input.port),
  };
  const tmuxTmpDir = process.env.TMUX_TMPDIR?.trim();
  if (tmuxTmpDir && path.isAbsolute(tmuxTmpDir) && !hasControlCharacters(tmuxTmpDir)) environment.TMUX_TMPDIR = tmuxTmpDir;
  return environment;
}

export type ServiceRenderInput = {
  host: string;
  port: number;
  entryPath: string;
  runtimePath?: string;
  home?: string;
  logPath?: string;
  tmuxPath?: string;
};

export function renderSystemdUnit(input: ServiceRenderInput): string {
  const runtimePath = input.runtimePath ?? process.execPath;
  const home = input.home ?? homedir();
  const logPath = input.logPath ?? path.join(home, '.tmux-web', 'logs', 'service.log');
  const environment = serviceEnvironment({ ...input, runtimePath }, home);
  const lines = [
    '[Unit]',
    'Description=tmux-web',
    'After=network.target',
    'StartLimitIntervalSec=300',
    'StartLimitBurst=5',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${quoteSystemd(home)}`,
    ...Object.entries(environment).map(([key, value]) => `Environment=${quoteSystemd(`${key}=${value}`)}`),
    `ExecStart=${[runtimePath, input.entryPath, '--host', input.host, '--port', String(input.port)].map(quoteSystemd).join(' ')}`,
    'Restart=on-failure',
    'RestartSec=5',
    'KillMode=mixed',
    'TimeoutStopSec=30',
    `StandardOutput=append:${escapeSystemd(logPath)}`,
    `StandardError=append:${escapeSystemd(logPath)}`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ];
  return lines.join('\n');
}

export function renderLaunchAgent(input: ServiceRenderInput): string {
  const runtimePath = input.runtimePath ?? process.execPath;
  const home = input.home ?? homedir();
  const logPath = input.logPath ?? path.join(home, '.tmux-web', 'logs', 'service.log');
  const environment = serviceEnvironment({ ...input, runtimePath }, home);
  const entries = Object.entries(environment)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join('\n');
  const args = [runtimePath, input.entryPath, '--host', input.host, '--port', String(input.port)]
    .map((value) => `    <string>${escapeXml(value)}</string>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${LAUNCH_AGENT_LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    args,
    '  </array>',
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    entries,
    '  </dict>',
    '  <key>WorkingDirectory</key>',
    `  <string>${escapeXml(home)}</string>`,
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>ThrottleInterval</key>',
    '  <integer>5</integer>',
    '  <key>ExitTimeOut</key>',
    '  <integer>30</integer>',
    '  <key>StandardOutPath</key>',
    `  <string>${escapeXml(logPath)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${escapeXml(logPath)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function parseState(raw: string): ServiceState {
  try {
    const value = JSON.parse(raw) as Partial<ServiceState>;
    if (
      value.schemaVersion !== 1 ||
      (value.platform !== 'systemd' && value.platform !== 'launchd') ||
      typeof value.home !== 'string' ||
      typeof value.entryPath !== 'string' ||
      typeof value.runtimePath !== 'string' ||
      typeof value.host !== 'string' ||
      typeof value.port !== 'number' ||
      typeof value.allowRemote !== 'boolean' ||
      typeof value.unitPath !== 'string' ||
      typeof value.contentHash !== 'string' ||
      typeof value.ownerUid !== 'number' ||
      typeof value.installedAt !== 'number'
    ) throw new Error('invalid state');
    return value as ServiceState;
  } catch {
    throw new ServiceManagerError('invalid-state', 'service state is invalid');
  }
}

function commandFailure(result: CommandResult): string {
  return result.stderr?.trim() || result.stdout?.trim() || 'service command failed';
}

function isLoginUnavailable(result: CommandResult): boolean {
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.toLowerCase();
  return text.includes('no such process') || text.includes('could not bootstrap') || text.includes('unknown system error') || text.includes('could not find service');
}

export class ServiceManager {
  private readonly home: string;
  private readonly platform: ServicePlatform;
  private readonly uid: number;
  private readonly fs: ServiceFileSystem;
  private readonly exec: CommandExecutor;
  private readonly resolveExecutable: ExecutableResolver;
  private readonly now: () => number;
  private readonly configDir: string;
  private readonly unitPath: string;
  private readonly statePath: string;
  private readonly lockPath: string;
  private readonly pendingPath: string;
  private readonly transactionPath: string;
  private readonly logPath: string;
  private installPending = false;

  constructor(options: ServiceOptions = {}) {
    this.home = validateHome(options.home ?? process.env.HOME ?? homedir());
    this.platform = options.platform ?? (process.platform === 'darwin' ? 'launchd' : process.platform === 'linux' ? 'systemd' : (() => { throw new ServiceManagerError('invalid-platform', 'unsupported platform'); })());
    this.uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : -1);
    if (this.uid === 0) throw new ServiceManagerError('root-user', 'service installation as root is not supported');
    this.fs = options.fs ?? defaultFileSystem;
    this.exec = options.exec ?? defaultExecutor;
    this.resolveExecutable = options.resolveExecutable ?? defaultExecutableResolver;
    this.now = options.now ?? Date.now;
    this.configDir = path.join(this.home, '.config', 'tmux-web');
    this.unitPath = this.platform === 'systemd'
      ? path.join(this.home, '.config', 'systemd', 'user', SERVICE_NAME)
      : path.join(this.home, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
    this.statePath = path.join(this.configDir, STATE_FILE_NAME);
    this.lockPath = path.join(this.configDir, OPERATION_LOCK_NAME);
    this.pendingPath = path.join(this.configDir, PENDING_FILE_NAME);
    this.transactionPath = path.join(this.configDir, TRANSACTION_FILE_NAME);
    this.logPath = path.join(this.home, '.tmux-web', 'logs', 'service.log');
  }

  get awaitingLogin(): boolean {
    return this.installPending;
  }

  get paths(): { unitPath: string; statePath: string; lockPath: string; pendingPath: string; transactionPath: string; logPath: string } {
    return {
      unitPath: this.unitPath,
      statePath: this.statePath,
      lockPath: this.lockPath,
      pendingPath: this.pendingPath,
      transactionPath: this.transactionPath,
      logPath: this.logPath,
    };
  }

  async install(input: InstallOptions): Promise<ServiceState> {
    const host = parseListenHost(input.host);
    const port = parseListenPort(String(input.port));
    if (!input.allowRemote && !isLoopbackHost(host)) {
      throw new ServiceManagerError('remote-not-allowed', 'non-loopback host requires allowRemote');
    }
    validateEntry(input.entryPath, this.fs);
    const tmuxPath = await this.checkTmux();
    const runtimePath = input.runtimePath ?? process.execPath;
    const renderInput = { ...input, host, port, runtimePath, home: this.home, logPath: this.logPath, tmuxPath };
    const content = this.platform === 'systemd' ? renderSystemdUnit(renderInput) : renderLaunchAgent(renderInput);
    const state: ServiceState = {
      schemaVersion: 1,
      platform: this.platform,
      home: this.home,
      entryPath: input.entryPath,
      runtimePath,
      host,
      port,
      allowRemote: input.allowRemote === true,
      unitPath: this.unitPath,
      contentHash: hash(content),
      ownerUid: this.uid,
      installedAt: this.now(),
    };
    return this.withLock(async () => {
      const previous = this.ownership(input.force === true);
      const previousUnit = this.readOptional(this.unitPath);
      const previousState = this.readOptional(this.statePath);
      this.atomicWrite(this.transactionPath, JSON.stringify({ oldHash: previous?.contentHash, newHash: state.contentHash }) + '\n', this.configDir);
      try {
        this.fs.mkdir(path.dirname(this.logPath), { recursive: true, mode: 0o700 });
        if (this.exists(this.unitPath) && input.noStart !== true) await this.stop();
        this.atomicWrite(this.unitPath, content, path.dirname(this.unitPath));
        this.atomicWrite(this.statePath, JSON.stringify(state) + '\n', this.configDir);
        const pending = await this.activate(input.noStart === true);
        this.installPending = pending;
        if (input.noStart === true || pending) this.atomicWrite(this.pendingPath, `${state.contentHash}\n`, this.configDir);
        else this.remove(this.pendingPath);
        this.remove(this.transactionPath);
        return state;
      } catch (error) {
        this.rollbackFile(this.unitPath, previousUnit);
        this.rollbackFile(this.statePath, previousState);
        this.remove(this.transactionPath);
        throw new ServiceManagerError('rollback', error instanceof Error ? error.message : 'service installation failed');
      }
    });
  }

  status(): ServiceStatus {
    const stateRaw = this.readOptional(this.statePath);
    if (!stateRaw) {
      return { installed: false, problem: this.exists(this.unitPath) ? 'ownership-mismatch' : 'missing-state', unitPath: this.unitPath, logPath: this.logPath };
    }
    let state: ServiceState;
    try {
      state = parseState(stateRaw);
    } catch (error) {
      return { installed: false, problem: (error as ServiceManagerError).code, unitPath: this.unitPath, logPath: this.logPath };
    }
    if (state.platform !== this.platform) return { installed: false, problem: 'platform-mismatch', state, unitPath: this.unitPath, logPath: this.logPath };
    if (state.home !== this.home || state.ownerUid !== this.uid || state.unitPath !== this.unitPath) return { installed: false, problem: 'ownership-mismatch', state, unitPath: this.unitPath, logPath: this.logPath };
    if (!this.exists(this.unitPath)) return { installed: false, problem: 'missing-unit', state, unitPath: this.unitPath, logPath: this.logPath };
    try {
      const unit = this.fs.stat(this.unitPath);
      if (unit.uid !== this.uid) return { installed: false, problem: 'ownership-mismatch', state, unitPath: this.unitPath, logPath: this.logPath };
    } catch {
      return { installed: false, problem: 'missing-unit', state, unitPath: this.unitPath, logPath: this.logPath };
    }
    const content = this.readOptional(this.unitPath);
    if (content === undefined || hash(content) !== state.contentHash) return { installed: false, problem: 'hash-mismatch', state, unitPath: this.unitPath, logPath: this.logPath };
    try {
      validateEntry(state.entryPath, this.fs);
    } catch (error) {
      return { installed: false, problem: (error as ServiceManagerError).code, state, unitPath: this.unitPath, logPath: this.logPath };
    }
    return { installed: true, pendingRestart: this.exists(this.pendingPath), state, unitPath: this.unitPath, logPath: this.logPath };
  }

  async runtimeStatus(): Promise<ServiceRuntimeStatus> {
    const status = this.status();
    if (!status.installed) return status;
    if (this.platform === 'systemd') {
      const active = await this.run(['is-active', SERVICE_NAME], true);
      const enabled = await this.run(['is-enabled', SERVICE_NAME], true);
      const text = `${active.stderr ?? ''}\n${enabled.stderr ?? ''}`.toLowerCase();
      const problem = text.includes('failed to connect to bus') || text.includes('user manager')
        ? 'user-manager-unavailable'
        : enabled.stdout?.trim() !== 'enabled'
          ? 'service-disabled'
          : active.code !== 0
            ? 'service-stopped'
            : undefined;
      return { ...status, active: active.code === 0, enabled: enabled.stdout?.trim() === 'enabled', problem };
    }
    const result = await this.run(['print', `gui/${this.uid}/${LAUNCH_AGENT_LABEL}`], true);
    if (result.code === 0) return { ...status, active: true, enabled: true };
    const awaitingLogin = isLoginUnavailable(result);
    return { ...status, active: false, enabled: false, awaitingLogin, problem: awaitingLogin ? undefined : 'service-stopped' };
  }

  async restart(): Promise<void> {
    await this.withLock(async () => {
      const status = this.status();
      if (!status.installed) throw new ServiceManagerError(status.problem ?? 'not-installed', 'service is not installed');
      await this.stop();
      this.installPending = await this.activate(false);
      this.remove(this.pendingPath);
    });
  }

  async uninstall(force = false): Promise<void> {
    await this.withLock(async () => {
      const status = this.status();
      if (!status.installed && !this.exists(this.unitPath) && !this.exists(this.statePath)) return;
      if (!status.installed && !force) throw new ServiceManagerError(status.problem ?? 'not-installed', 'service is not installed or owned by this user');
      if (this.platform === 'systemd') {
        await this.run(['disable', '--now', SERVICE_NAME]);
      } else {
        const result = await this.run(['bootout', '--wait', `gui/${this.uid}/${LAUNCH_AGENT_LABEL}`], true);
        if (result.code !== 0 && !isLoginUnavailable(result)) throw new Error(commandFailure(result));
      }
      this.remove(this.unitPath);
      this.remove(this.statePath);
      this.remove(this.pendingPath);
      this.remove(this.transactionPath);
      this.installPending = false;
      if (this.platform === 'systemd') await this.run(['daemon-reload']);
    });
  }

  private async checkTmux(): Promise<string> {
    const executable = this.resolveExecutable('tmux');
    if (!executable) throw new ServiceManagerError('activation-failed', 'tmux is not available on PATH');
    const result = await this.exec(executable, ['-V']);
    if ((result.code ?? 0) !== 0) throw new ServiceManagerError('activation-failed', 'tmux is not available on PATH');
    return executable;
  }

  private ownership(force: boolean): ServiceState | undefined {
    const stateRaw = this.readOptional(this.statePath);
    const unitRaw = this.readOptional(this.unitPath);
    if (!stateRaw && !unitRaw) return undefined;
    if (!stateRaw) {
      if (force) return undefined;
      throw new ServiceManagerError('ownership-mismatch', 'service registration has no ownership state');
    }
    const state = parseState(stateRaw);
    if (force) return state;
    if (state.home !== this.home || state.ownerUid !== this.uid || state.unitPath !== this.unitPath) throw new ServiceManagerError('ownership-mismatch', 'service registration belongs to another user or home');
    if (unitRaw !== undefined && hash(unitRaw) !== state.contentHash) throw new ServiceManagerError('hash-mismatch', 'service registration was modified outside tmux-web');
    return state;
  }

  private async activate(noStart: boolean): Promise<boolean> {
    if (this.platform === 'systemd') {
      await this.run(['daemon-reload']);
      await this.run(['enable', SERVICE_NAME]);
      if (!noStart) await this.run(['restart', SERVICE_NAME]);
      return false;
    }
    const enabled = await this.run(['enable', `gui/${this.uid}/${LAUNCH_AGENT_LABEL}`], true);
    if (enabled.code !== 0 && !isLoginUnavailable(enabled)) throw new Error(commandFailure(enabled));
    if (noStart) return true;
    const result = await this.run(['bootstrap', `gui/${this.uid}`, this.unitPath], true);
    if (result.code !== 0 && isLoginUnavailable(result)) return true;
    if (result.code !== 0) throw new Error(commandFailure(result));
    return false;
  }

  private async stop(): Promise<void> {
    if (this.platform === 'systemd') {
      await this.run(['stop', SERVICE_NAME], true);
      return;
    }
    const result = await this.run(['bootout', '--wait', `gui/${this.uid}/${LAUNCH_AGENT_LABEL}`], true);
    if (result.code !== 0 && !isLoginUnavailable(result)) throw new Error(commandFailure(result));
  }

  private async run(args: readonly string[], tolerateFailure = false): Promise<CommandResult> {
    const command = this.platform === 'systemd' ? 'systemctl' : 'launchctl';
    const commandArgs = this.platform === 'systemd' ? ['--user', ...args] : args;
    const result = await this.exec(command, commandArgs);
    const normalized = { code: result.code ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    if (!tolerateFailure && normalized.code !== 0) throw new Error(commandFailure(normalized));
    return normalized;
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    this.fs.mkdir(this.configDir, { recursive: true, mode: 0o700 });
    try {
      this.fs.writeFile(this.lockPath, `${process.pid}\n`, { mode: 0o600, flag: 'wx' });
    } catch {
      throw new ServiceManagerError('operation-locked', 'another service operation is in progress');
    }
    try {
      return await operation();
    } finally {
      this.remove(this.lockPath);
    }
  }

  private atomicWrite(file: string, content: string, directory: string): void {
    this.fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.${this.now()}.tmp`;
    this.fs.writeFile(temporary, content, { mode: 0o600 });
    this.fs.chmod(temporary, 0o600);
    this.fs.rename(temporary, file);
    this.fs.chmod(file, 0o600);
  }

  private rollbackFile(file: string, content: string | undefined): void {
    if (content === undefined) this.remove(file);
    else {
      try { this.atomicWrite(file, content, path.dirname(file)); } catch {}
    }
  }

  private readOptional(file: string): string | undefined {
    try { return this.fs.readFile(file); } catch { return undefined; }
  }

  private exists(file: string): boolean {
    try { this.fs.stat(file); return true; } catch { return false; }
  }

  private remove(file: string): void {
    try { this.fs.unlink(file); } catch {}
  }
}

export function createServiceManager(options: ServiceOptions = {}): ServiceManager {
  return new ServiceManager(options);
}

export function serviceHealthUrl(host: string, port: number): string {
  const connectHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host === 'localhost' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  return `http://${connectHost}:${port}/healthz`;
}

export async function probeServiceHealth(host: string, port: number, timeoutMs = 500, attempts = 10): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(serviceHealthUrl(host, port), { signal: controller.signal });
      if (response.ok) return true;
    } catch {}
    finally {
      clearTimeout(timer);
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}
