import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { LAUNCH_AGENT_LABEL, SERVICE_NAME } from './service-manager.js';

const execFileAsync = promisify(execFile);

export type ServiceRuntimePlatform = 'systemd' | 'launchd';

export type ServiceRuntimeExecResult = { stdout: string; stderr: string };

export type ServiceRuntimeExec = (
	command: string,
	args: readonly string[],
) => Promise<ServiceRuntimeExecResult>;

export type ServiceRuntimeOptions = {
	platform?: ServiceRuntimePlatform;
	home?: string;
	uid?: number;
	pid?: number;
	exec?: ServiceRuntimeExec;
};

type ServiceRuntimeContext = {
	platform: ServiceRuntimePlatform;
	unitPath: string;
	uid: number;
	pid: number;
	exec: ServiceRuntimeExec;
};

function resolveContext(options: ServiceRuntimeOptions): ServiceRuntimeContext | undefined {
	const platform = options.platform
		?? (process.platform === 'darwin' ? 'launchd' : process.platform === 'linux' ? 'systemd' : undefined);
	if (!platform) return undefined;
	const home = options.home ?? process.env.HOME ?? homedir();
	const uid = options.uid ?? (typeof process.getuid === 'function' ? process.getuid() : -1);
	const unitPath = platform === 'systemd'
		? path.join(home, '.config', 'systemd', 'user', SERVICE_NAME)
		: path.join(home, 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
	return {
		platform,
		unitPath,
		uid,
		pid: options.pid ?? process.pid,
		exec: options.exec ?? (async (command, args) => await execFileAsync(command, args, { encoding: 'utf8' }) as unknown as ServiceRuntimeExecResult),
	};
}

async function serviceMainPid(context: ServiceRuntimeContext): Promise<number | undefined> {
	if (context.platform === 'systemd') {
		const { stdout } = await context.exec('systemctl', ['--user', 'show', SERVICE_NAME, '--property=MainPID', '--value']);
		const pid = Number.parseInt(stdout.trim(), 10);
		return Number.isFinite(pid) && pid > 0 ? pid : undefined;
	}
	const { stdout } = await context.exec('launchctl', ['print', `gui/${context.uid}/${LAUNCH_AGENT_LABEL}`]);
	const match = stdout.match(/\bpid\s*=\s*(\d+)/);
	if (!match) return undefined;
	const pid = Number.parseInt(match[1], 10);
	return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

/**
 * Whether the current process is the one spawned by the tmux-web service unit.
 * Installed services created before the TMUX_WEB_SERVICE marker existed are
 * still detected via the unit's MainPID, so no reinstall is required.
 */
export async function isServiceProcess(options: ServiceRuntimeOptions = {}): Promise<boolean> {
	if (process.env.TMUX_WEB_SERVICE === '1') return true;
	const context = resolveContext(options);
	if (!context) return false;
	if (!existsSync(context.unitPath)) return false;
	try {
		const pid = await serviceMainPid(context);
		return pid !== undefined && pid === context.pid;
	} catch {
		return false;
	}
}

/**
 * Ask the service manager to restart the tmux-web service. Best effort:
 * returns false when the platform is unsupported or the command fails
 * (e.g. the service is not installed).
 */
export async function restartService(options: ServiceRuntimeOptions = {}): Promise<boolean> {
	const context = resolveContext(options);
	if (!context) return false;
	try {
		if (context.platform === 'systemd') {
			await context.exec('systemctl', ['--user', 'restart', SERVICE_NAME]);
		} else {
			await context.exec('launchctl', ['kickstart', '-k', `gui/${context.uid}/${LAUNCH_AGENT_LABEL}`]);
		}
		return true;
	} catch {
		return false;
	}
}
