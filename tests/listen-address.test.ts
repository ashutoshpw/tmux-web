import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LISTEN_HOST,
	DEFAULT_LISTEN_PORT,
	isLoopbackHost,
	parseListenHost,
	parseListenPort,
	resolveListenAddress,
} from '../src/lib/listen-address.js';

describe('listen address', () => {
	it('uses loopback defaults', () => {
		expect(resolveListenAddress({ env: {} })).toEqual({
			host: DEFAULT_LISTEN_HOST,
			port: DEFAULT_LISTEN_PORT,
			isLoopback: true,
		});
	});

	it('resolves dedicated environment values before legacy PORT', () => {
		expect(resolveListenAddress({
			env: { TMUX_WEB_HOST: 'example.test', TMUX_WEB_PORT: '8080', PORT: '9000' },
		})).toEqual({ host: 'example.test', port: 8080, isLoopback: false });
	});

	it('resolves CLI values before environment values', () => {
		expect(resolveListenAddress({
			argv: ['--host=::1', '--port', '4321'],
			env: { TMUX_WEB_HOST: 'example.test', TMUX_WEB_PORT: '8080', PORT: '9000' },
		})).toEqual({ host: '::1', port: 4321, isLoopback: true });
	});

	it('accepts IPv4, bracketed IPv6, and DNS hostnames', () => {
		expect(parseListenHost('192.168.1.10')).toBe('192.168.1.10');
		expect(parseListenHost('[2001:db8::1]')).toBe('2001:db8::1');
		expect(parseListenHost('web-01.example.test')).toBe('web-01.example.test');
	});

	it('classifies loopback addresses and localhost', () => {
		expect(isLoopbackHost('127.0.0.1')).toBe(true);
		expect(isLoopbackHost('127.42.8.9')).toBe(true);
		expect(isLoopbackHost('::1')).toBe(true);
		expect(isLoopbackHost('localhost')).toBe(true);
		expect(isLoopbackHost('0.0.0.0')).toBe(false);
		expect(isLoopbackHost('example.test')).toBe(false);
	});

	it('rejects malformed hosts and ports', () => {
		for (const value of ['', ' 127.0.0.1', '01.2.3.4', '256.1.1.1', '1.2.3.4:3000', '-bad.test', 'bad_.test']) {
			expect(() => parseListenHost(value)).toThrow(/invalid host/);
		}
		for (const value of ['', '0', '65536', '3.14', ' 3000', '+3000']) {
			expect(() => parseListenPort(value)).toThrow(/invalid port/);
		}
	});

  it('does not fall back when a higher-precedence value is invalid', () => {
    expect(() => resolveListenAddress({ env: { TMUX_WEB_PORT: 'bad', PORT: '8080' } })).toThrow(/invalid port/);
  });

  it('rejects incomplete and duplicate CLI options', () => {
		expect(() => resolveListenAddress({ argv: ['--host'] })).toThrow(/invalid host/);
		expect(() => resolveListenAddress({ argv: ['--port', '--host', '127.0.0.1'] })).toThrow(/invalid port/);
		expect(() => resolveListenAddress({ argv: ['--port=3000', '--port=4000'] })).toThrow(/invalid port/);
	});
});
