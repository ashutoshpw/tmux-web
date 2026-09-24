import { describe, expect, it } from 'vitest';
import { LAUNCH_AGENT_LABEL, SERVICE_NAME, ServiceManager, ServiceManagerError, renderLaunchAgent, renderSystemdUnit, serviceHealthUrl, type CommandResult, type ServiceFileSystem, type ServiceFileStat } from '../src/lib/service-manager.js';

class MemoryFs implements ServiceFileSystem {
  files = new Map<string, { data: string; stat: ServiceFileStat }>();
  writes: Array<{ path: string; mode?: number; flag?: string }> = [];
  dirs = new Set<string>();
  readFile(path: string): string { const file = this.files.get(path); if (!file) throw new Error('ENOENT'); return file.data; }
  writeFile(path: string, data: string, options?: { mode?: number; flag?: string }): void { if (options?.flag === 'wx' && this.files.has(path)) throw new Error('EEXIST'); this.writes.push({ path, mode: options?.mode, flag: options?.flag }); this.files.set(path, { data, stat: { uid: 42, mode: options?.mode ?? 0o644, isFile: true } }); }
  mkdir(path: string): void { this.dirs.add(path); }
  rename(from: string, to: string): void { const file = this.files.get(from); if (!file) throw new Error('ENOENT'); this.files.set(to, file); this.files.delete(from); }
  chmod(path: string, mode: number): void { const file = this.files.get(path); if (!file) throw new Error('ENOENT'); file.stat.mode = mode; }
  stat(path: string): ServiceFileStat { const file = this.files.get(path); if (!file) throw new Error('ENOENT'); return file.stat; }
  unlink(path: string): void { if (!this.files.delete(path)) throw new Error('ENOENT'); }
}

function setup(platform: 'systemd' | 'launchd' = 'systemd') {
  const fs = new MemoryFs();
  fs.files.set('/opt/tmux-web', { data: '', stat: { uid: 42, mode: 0o755, isFile: true } });
  const commands: string[][] = [];
  const exec = (command: string, args: readonly string[]): CommandResult => { commands.push([command, ...args]); return {}; };
  return { fs, commands, manager: new ServiceManager({ home: '/home/test', uid: 42, platform, fs, exec, resolveExecutable: () => '/opt/tmux', now: () => 123 }) };
}

describe('service manager', () => {
  it('renders escaped service environment values', () => {
    const systemd = renderSystemdUnit({ host: '::1', port: 4321, entryPath: '/opt/tmux-web', runtimePath: '/opt/node', home: '/home/test user', logPath: '/home/test user/.tmux-web/logs/service.log' });
    expect(systemd).toContain('WorkingDirectory="/home/test user"');
    expect(systemd).toContain('TMUX_WEB_MODE=production');
    const plist = renderLaunchAgent({ host: '::1', port: 4321, entryPath: '/opt/a&b', runtimePath: '/opt/node', home: '/home/test', logPath: '/home/test/logs/service.log' });
    expect(plist).toContain('/opt/a&amp;b');
    expect(plist).toContain('<key>RunAtLoad</key>');
  });

  it('renders and installs a user systemd service atomically', async () => {
    const { fs, commands, manager } = setup();
    await manager.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web', noStart: true });
    expect(fs.readFile(manager.paths.unitPath)).toContain('ExecStart=');
    expect(fs.stat(manager.paths.unitPath).mode).toBe(0o600);
    expect(fs.stat(manager.paths.statePath).mode).toBe(0o600);
		expect(commands).toEqual([['/opt/tmux', '-V'], ['systemctl', '--user', 'daemon-reload'], ['systemctl', '--user', 'enable', SERVICE_NAME]]);
  });

  it('renders launchd commands with a stable label', async () => {
    const { fs, commands, manager } = setup('launchd');
    await manager.install({ host: '::1', port: 4321, entryPath: '/opt/tmux-web' });
    expect(fs.readFile(manager.paths.unitPath)).toContain(`<string>${LAUNCH_AGENT_LABEL}</string>`);
		expect(commands).toEqual([['/opt/tmux', '-V'], ['launchctl', 'enable', `gui/42/${LAUNCH_AGENT_LABEL}`], ['launchctl', 'bootstrap', 'gui/42', manager.paths.unitPath]]);
  });

  it('rejects root, remote, ephemeral, and missing executable installs', async () => {
    const { fs } = setup();
    expect(() => new ServiceManager({ home: '/home/test', uid: 0, platform: 'systemd', fs })).toThrowError(ServiceManagerError);
    await expect(new ServiceManager({ home: '/home/test', uid: 42, platform: 'systemd', fs }).install({ host: '0.0.0.0', port: 3000, entryPath: '/opt/tmux-web' })).rejects.toMatchObject({ code: 'remote-not-allowed' });
    await expect(new ServiceManager({ home: '/home/test', uid: 42, platform: 'systemd', fs }).install({ host: '127.0.0.1', port: 3000, entryPath: '/tmp/tmux-web' })).rejects.toMatchObject({ code: 'invalid-entry-path' });
    await expect(new ServiceManager({ home: '/home/test', uid: 42, platform: 'systemd', fs }).install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/missing' })).rejects.toMatchObject({ code: 'missing-executable' });
  });

  it('reports ownership and content tampering', async () => {
    const { fs, manager } = setup();
    await manager.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web' });
    expect(manager.status().installed).toBe(true);
    fs.files.get(manager.paths.unitPath)!.stat.uid = 99;
    expect(manager.status().problem).toBe('ownership-mismatch');
    fs.files.get(manager.paths.unitPath)!.stat.uid = 42;
    fs.files.get(manager.paths.unitPath)!.data += 'tampered';
    expect(manager.status().problem).toBe('hash-mismatch');
  });

  it('serializes operations and rolls back failed installs', async () => {
    const { fs, manager } = setup();
    fs.writeFile(manager.paths.lockPath, 'busy', { flag: 'wx', mode: 0o600 });
    await expect(manager.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web' })).rejects.toMatchObject({ code: 'operation-locked' });
    fs.unlink(manager.paths.lockPath);
		const failing = new ServiceManager({ home: '/home/test', uid: 42, platform: 'systemd', fs, exec: (command) => command === '/opt/tmux' ? {} : ({ code: 1, stderr: 'nope' }), resolveExecutable: () => '/opt/tmux' });
    await expect(failing.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web' })).rejects.toMatchObject({ code: 'rollback' });
    expect(() => fs.readFile(failing.paths.unitPath)).toThrow();
  });

  it('restarts and uninstalls an installed service', async () => {
    const { commands, manager } = setup();
    await manager.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web', noStart: true });
    await manager.restart();
    await manager.uninstall();
		expect(commands).toContainEqual(['systemctl', '--user', 'disable', '--now', SERVICE_NAME]);
		expect(commands.at(-1)).toEqual(['systemctl', '--user', 'daemon-reload']);
    expect(manager.status().problem).toBe('missing-state');
  });

  it('records the resolved tmux directory and repairs an owned service', async () => {
    const { fs, manager } = setup();
    await manager.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web', noStart: true });
    expect(fs.readFile(manager.paths.unitPath)).toContain('/opt');
    await manager.install({ host: '127.0.0.1', port: 3001, entryPath: '/opt/tmux-web', noStart: true });
    expect(manager.status().installed).toBe(true);
    expect(manager.status().pendingRestart).toBe(true);
  });

  it('marks launchd installs without a GUI domain as pending', async () => {
    const fs = new MemoryFs();
    fs.files.set('/opt/tmux-web', { data: '', stat: { uid: 42, mode: 0o755, isFile: true } });
    const manager = new ServiceManager({
      home: '/home/test',
      uid: 42,
      platform: 'launchd',
      fs,
      resolveExecutable: () => '/opt/tmux',
      exec: (command, args) => command === 'launchctl' && args[0] === 'bootstrap'
        ? { code: 1, stderr: 'No such process' }
        : {},
    });
    await manager.install({ host: '127.0.0.1', port: 3000, entryPath: '/opt/tmux-web' });
    expect(manager.awaitingLogin).toBe(true);
    expect(manager.status().pendingRestart).toBe(true);
  });

  it('uses loopback probes for wildcard binds', () => {
    expect(serviceHealthUrl('0.0.0.0', 3000)).toBe('http://127.0.0.1:3000/healthz');
    expect(serviceHealthUrl('::', 3000)).toBe('http://[::1]:3000/healthz');
  });
});
