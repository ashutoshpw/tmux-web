import { isIP } from 'node:net';

export const DEFAULT_LISTEN_HOST = '127.0.0.1';
export const DEFAULT_LISTEN_PORT = 3000;

export type ListenAddress = {
	host: string;
	port: number;
	isLoopback: boolean;
};

export type ListenAddressOptions = {
	argv?: readonly string[];
	env?: NodeJS.ProcessEnv;
};

function invalid(name: string, value: string): never {
	throw new Error(`invalid ${name}: ${JSON.stringify(value)}`);
}

export function parseListenHost(value: string): string {
	if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
		return invalid('host', value);
	}

	const host = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
	if (!host || host.includes('[') || host.includes(']') || host.includes('/') || /\s/.test(host)) {
		return invalid('host', value);
	}

	const addressType = isIP(host);
	if (addressType === 4) {
		if (!host.split('.').every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) {
			return invalid('host', value);
		}
		return host;
	}
	if (addressType === 6) return host;
	if (host.includes('.') && host.split('.').every((part) => /^\d+$/.test(part))) {
		return invalid('host', value);
	}

	if (host.length > 253 || !host.split('.').every((label) =>
		label.length > 0 && label.length <= 63 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label),
	)) {
		return invalid('host', value);
	}
	return host;
}

export function parseListenPort(value: string): number {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return invalid('port', value);
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return invalid('port', value);
	return port;
}

export function isLoopbackHost(host: string): boolean {
	const parsed = parseListenHost(host);
	if (parsed === 'localhost') return true;
	if (isIP(parsed) === 6) return parsed === '::1';
	if (isIP(parsed) === 4) return Number(parsed.split('.')[0]) === 127;
	return false;
}

function readCli(argv: readonly string[]): { host?: string; port?: string } {
	let host: string | undefined;
	let port: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const match = arg.match(/^--(host|port)(?:=(.*))?$/);
		if (!match) continue;
		const name = match[1] as 'host' | 'port';
		const value = match[2] ?? argv[++index];
		if (value === undefined || value.startsWith('--')) invalid(name, value ?? '');
		if (name === 'host') {
			if (host !== undefined) invalid('host', value);
			host = value;
		} else {
			if (port !== undefined) invalid('port', value);
			port = value;
		}
	}
	return { host, port };
}

export function resolveListenAddress(options: ListenAddressOptions = {}): ListenAddress {
	const env = options.env ?? process.env;
	const cli = readCli(options.argv ?? []);
	const host = parseListenHost(cli.host ?? env.TMUX_WEB_HOST ?? DEFAULT_LISTEN_HOST);
	const port = parseListenPort(cli.port ?? env.TMUX_WEB_PORT ?? env.PORT ?? String(DEFAULT_LISTEN_PORT));
	return { host, port, isLoopback: isLoopbackHost(host) };
}
