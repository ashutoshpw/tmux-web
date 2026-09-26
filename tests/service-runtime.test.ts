import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isServiceProcess, restartService } from '../src/lib/service-runtime.js';
import { LAUNCH_AGENT_LABEL, SERVICE_NAME } from '../src/lib/service-manager.js';

describe('service runtime', () => {
	let home: string;
	const previousMarker = process.env.TMUX_WEB_SERVICE;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), 'tmux-web-runtime-'));
		delete process.env.TMUX_WEB_SERVICE;
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
		if (previousMarker === undefined) delete process.env.TMUX_WEB_SERVICE;
		else process.env.TMUX_WEB_SERVICE = previousMarker;
	});

	function writeSystemdUnit(): string {
		const dir = join(home, '.config', 'systemd', 'user');
		mkdirSync(dir, { recursive: true });
		const unitPath = join(dir, SERVICE_NAME);
		writeFileSync(unitPath, '[Unit]\nDescription=tmux-web\n');
		return unitPath;
	}

	function writeLaunchAgentPlist(): string {
		const dir = join(home, 'Library', 'LaunchAgents');
		mkdirSync(dir, { recursive: true });
		const plistPath = join(dir, `${LAUNCH_AGENT_LABEL}.plist`);
		writeFileSync(plistPath, '<?xml version="1.0"?><plist version="1.0"></plist>\n');
		return plistPath;
	}

	it('detects the service process via systemd MainPID', async () => {
		writeSystemdUnit();
		const calls: Array<{ command: string; args: string[] }> = [];
		const detected = await isServiceProcess({
			platform: 'systemd',
			home,
			pid: 4242,
			exec: async (command, args) => {
				calls.push({ command, args: [...args] });
				return { stdout: '4242\n', stderr: '' };
			},
		});
		expect(detected).toBe(true);
		expect(calls).toEqual([
			{ command: 'systemctl', args: ['--user', 'show', SERVICE_NAME, '--property=MainPID', '--value'] },
		]);
	});

	it('does not detect the service process when MainPID differs', async () => {
		writeSystemdUnit();
		const detected = await isServiceProcess({
			platform: 'systemd',
			home,
			pid: 1111,
			exec: async () => ({ stdout: '4242\n', stderr: '' }),
		});
		expect(detected).toBe(false);
	});

	it('does not detect the service process when the unit file is missing', async () => {
		const detected = await isServiceProcess({
			platform: 'systemd',
			home,
			pid: 4242,
			exec: async () => ({ stdout: '4242\n', stderr: '' }),
		});
		expect(detected).toBe(false);
	});

	it('detects the service process via launchd pid', async () => {
		writeLaunchAgentPlist();
		const detected = await isServiceProcess({
			platform: 'launchd',
			home,
			uid: 1000,
			pid: 4242,
			exec: async (_command, args) => {
				expect(args[0]).toBe('print');
				expect(args[1]).toBe(`gui/1000/${LAUNCH_AGENT_LABEL}`);
				return { stdout: `\tpid = 4242\n\tstate = running\n`, stderr: '' };
			},
		});
		expect(detected).toBe(true);
	});

	it('short-circuits on the TMUX_WEB_SERVICE marker', async () => {
		process.env.TMUX_WEB_SERVICE = '1';
		const detected = await isServiceProcess({
			platform: 'systemd',
			home,
			pid: 1,
			exec: async () => {
				throw new Error('must not be called');
			},
		});
		expect(detected).toBe(true);
	});

	it('returns false when probing fails', async () => {
		writeSystemdUnit();
		const detected = await isServiceProcess({
			platform: 'systemd',
			home,
			pid: 4242,
			exec: async () => {
				throw new Error('no systemd user bus');
			},
		});
		expect(detected).toBe(false);
	});

	it('restarts via systemctl on systemd', async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const issued = await restartService({
			platform: 'systemd',
			home,
			exec: async (command, args) => {
				calls.push({ command, args: [...args] });
				return { stdout: '', stderr: '' };
			},
		});
		expect(issued).toBe(true);
		expect(calls).toEqual([{ command: 'systemctl', args: ['--user', 'restart', SERVICE_NAME] }]);
	});

	it('restarts via launchctl kickstart on launchd', async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const issued = await restartService({
			platform: 'launchd',
			home,
			uid: 1000,
			exec: async (command, args) => {
				calls.push({ command, args: [...args] });
				return { stdout: '', stderr: '' };
			},
		});
		expect(issued).toBe(true);
		expect(calls).toEqual([
			{ command: 'launchctl', args: ['kickstart', '-k', `gui/1000/${LAUNCH_AGENT_LABEL}`] },
		]);
	});

	it('reports false when the restart command fails', async () => {
		const issued = await restartService({
			platform: 'systemd',
			home,
			exec: async () => {
				throw new Error('Failed to restart unit: not found');
			},
		});
		expect(issued).toBe(false);
	});
});
