import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { isIP } from 'node:net';
import { resolveListenAddress, type ListenAddress } from './listen-address.js';
import { createServiceManager, probeServiceHealth, ServiceManagerError, type InstallOptions, type ServiceStatus } from './service-manager.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

function getServiceEntryPath(): string {
  return path.resolve(moduleDirectory, '..', '..', 'dist', 'index.js');
}

function serviceEnvPath(): string {
  return path.join(process.env.HOME ?? homedir(), '.tmux-web', '.env');
}

function assertProductionEnvironment(): void {
  const mode = process.env.TMUX_WEB_MODE?.trim().toLowerCase();
  const dev = process.env.TMUX_WEB_DEV?.trim().toLowerCase();
  if (mode === 'development' || mode === 'dev' || dev === '1' || dev === 'true' || dev === 'yes' || process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev') {
    throw new Error('service mode cannot use development environment settings');
  }
}

function loadServiceEnvironment(): void {
  const envPath = serviceEnvPath();
  let content: string;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

type InstallFlags = {
  addressArgs: string[];
  noStart: boolean;
  force: boolean;
  allowRemote: boolean;
};

function parseInstallFlags(args: readonly string[]): InstallFlags {
  const addressArgs: string[] = [];
  let noStart = false;
  let force = false;
  let allowRemote = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-start') { noStart = true; continue; }
    if (arg === '--force') { force = true; continue; }
    if (arg === '--allow-remote') { allowRemote = true; continue; }
    if (arg === '--host' || arg === '--port') {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      addressArgs.push(arg, value);
      index += 1;
      continue;
    }
    if (arg.startsWith('--host=') || arg.startsWith('--port=')) {
      addressArgs.push(arg);
      continue;
    }
    throw new Error(`unknown service option: ${arg}`);
  }
  return { addressArgs, noStart, force, allowRemote };
}

function validateServiceHost(address: ListenAddress): void {
  if (address.host !== 'localhost' && isIP(address.host) === 0) {
    throw new Error('service host must be localhost, an IP address, or a wildcard address');
  }
}

function printStatus(status: ServiceStatus): void {
  if (!status.installed) {
    console.log(`tmux-web service is not installed${status.problem ? ` (${status.problem})` : ''}.`);
    console.log(`Unit: ${status.unitPath}`);
    console.log(`Logs: ${status.logPath}`);
    return;
  }
  const state = status.state;
  console.log(`tmux-web service is installed${status.pendingRestart ? ' (restart pending)' : ''}.`);
  console.log(`Address: ${state?.host}:${state?.port}`);
  if (status.active !== undefined) console.log(`State: ${status.active ? 'active' : 'inactive'}`);
  if (status.enabled !== undefined) console.log(`Enabled: ${status.enabled ? 'yes' : 'no'}`);
  console.log(`Unit: ${status.unitPath}`);
  console.log(`Logs: ${status.logPath}`);
  if (status.problem) console.log(`Problem: ${status.problem}`);
}

function printServiceUsage(): void {
  console.log(`Usage:
  tmux-web service install [--host <address>] [--port <port>] [--allow-remote] [--no-start] [--force]
  tmux-web service status
  tmux-web service restart
  tmux-web service uninstall [--force]
`);
}

export async function runServiceCli(args: readonly string[]): Promise<number> {
  loadServiceEnvironment();
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printServiceUsage();
    return command ? 0 : 1;
  }
  try {
    assertProductionEnvironment();
    if (command === 'install') {
      const flags = parseInstallFlags(rest);
      const address = resolveListenAddress({ argv: flags.addressArgs, env: process.env });
      validateServiceHost(address);
      if (!address.isLoopback && !flags.allowRemote) throw new Error('non-loopback service host requires --allow-remote');
      const manager = createServiceManager();
      const state = await manager.install({
        host: address.host,
        port: address.port,
        entryPath: getServiceEntryPath(),
        runtimePath: process.execPath,
        noStart: flags.noStart,
        force: flags.force,
        allowRemote: flags.allowRemote,
      } satisfies InstallOptions);
      const healthy = flags.noStart ? false : await probeServiceHealth(state.host, state.port);
      const awaitingLogin = manager.awaitingLogin;
      console.log(`${flags.noStart || awaitingLogin ? 'Installed' : healthy ? 'Started' : 'Installed'} tmux-web service.`);
      console.log(`Address: ${state.host}:${state.port}`);
      console.log(`Unit: ${manager.paths.unitPath}`);
      console.log(`Logs: ${manager.paths.logPath}`);
      if (awaitingLogin) {
        console.log('The service will start at the next graphical login.');
        return 0;
      }
      if (!flags.noStart && !healthy) {
        console.error('The service was registered but did not become ready.');
        return 1;
      }
      return 0;
    }
    if (command === 'status') {
      const manager = createServiceManager();
      const status = await manager.runtimeStatus();
      printStatus(status);
      if (status.awaitingLogin) console.log('The service will start at the next graphical login.');
      return 0;
    }
    if (command === 'restart') {
      const manager = createServiceManager();
      await manager.restart();
      console.log('Restarted tmux-web service.');
      return 0;
    }
    if (command === 'uninstall') {
      const force = rest.includes('--force');
      const unknown = rest.filter((arg) => arg !== '--force');
      if (unknown.length > 0) throw new Error(`unknown service option: ${unknown[0]}`);
      const manager = createServiceManager();
      await manager.uninstall(force);
      console.log('Removed tmux-web service registration.');
      return 0;
    }
    console.error(`unknown service command: ${command}`);
    return 1;
  } catch (error) {
    if (error instanceof ServiceManagerError) console.error(`tmux-web service: ${error.message}`);
    else console.error(`tmux-web service: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
