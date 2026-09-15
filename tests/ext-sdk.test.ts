import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtBridge } from '../packages/ext-sdk/src/bridge.js';
import type { ExtMessage } from '../packages/ext-sdk/src/types.js';

type Listener = (event: { data: unknown }) => void;

function installWindow(pathname = '/ext/my-ext/ui/') {
	const listeners = new Set<Listener>();
	const posted: ExtMessage[] = [];
	(globalThis as unknown as { window: unknown }).window = {
		location: { pathname },
		addEventListener: (_type: string, cb: Listener) => {
			listeners.add(cb);
		},
		parent: {
			postMessage: (msg: ExtMessage) => {
				posted.push(msg);
			},
		},
	};
	return {
		posted,
		dispatch: (data: unknown) => {
			for (const cb of listeners) cb({ data });
		},
	};
}

describe('ExtBridge', () => {
	let win: ReturnType<typeof installWindow>;

	beforeEach(() => {
		win = installWindow();
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
		vi.unstubAllGlobals();
	});

	it('rejects URLs without an /ext/:id/ prefix', () => {
		installWindow('/settings');
		expect(() => new ExtBridge()).toThrow(/cannot detect extension id/);
	});

	it('detects the extension id from the iframe pathname', () => {
		const bridge = new ExtBridge();
		bridge.ready();
		expect(win.posted).toEqual([{ type: 'ext:ready' }]);
	});

	it('queues context until onContext is registered', () => {
		const bridge = new ExtBridge();
		const context = { session: 'main', host: 'dev1' };
		win.dispatch({ type: 'ext:context', context });

		const seen: unknown[] = [];
		bridge.onContext((ctx) => seen.push(ctx));
		expect(seen).toEqual([context]);
	});

	it('delivers context immediately when the handler is registered first', () => {
		const bridge = new ExtBridge();
		const seen: unknown[] = [];
		bridge.onContext((ctx) => seen.push(ctx));

		const context = { session: 'main', host: 'dev1' };
		win.dispatch({ type: 'ext:context', context });
		expect(seen).toEqual([context]);
	});

	it('keeps the latest config and flushes pending config to a late handler', () => {
		const bridge = new ExtBridge();
		win.dispatch({ type: 'ext:config', config: { a: 1 } });
		win.dispatch({ type: 'ext:config', config: { a: 2 } });
		expect(bridge.getConfig()).toEqual({ a: 2 });

		const seen: unknown[] = [];
		bridge.onConfig((cfg) => seen.push(cfg));
		expect(seen).toEqual([{ a: 2 }]);
	});

	it('flushes pending open/close to late handlers', () => {
		const bridge = new ExtBridge();
		win.dispatch({ type: 'ext:open' });
		win.dispatch({ type: 'ext:close' });

		const calls: string[] = [];
		bridge.onOpen(() => calls.push('open'));
		bridge.onClose(() => calls.push('close'));
		expect(calls).toEqual(['open', 'close']);
	});

	it('posts resize and panel messages to the host window', () => {
		const bridge = new ExtBridge();
		bridge.resize(240);
		bridge.openPanel();
		bridge.closePanel();
		expect(win.posted).toEqual([
			{ type: 'ext:resize', height: 240 },
			{ type: 'ext:panel-open' },
			{ type: 'ext:panel-close' },
		]);
	});

	it('requests through the extension API proxy', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ value: 42 }),
		}));
		vi.stubGlobal('fetch', fetchMock);

		const bridge = new ExtBridge();
		await expect(bridge.request('/status')).resolves.toEqual({ value: 42 });
		expect(fetchMock).toHaveBeenCalledWith('/ext/my-ext/api/status', { method: 'GET' });
	});

	it('serializes JSON bodies on requests', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		}));
		vi.stubGlobal('fetch', fetchMock);

		const bridge = new ExtBridge();
		await bridge.request('/items', { method: 'POST', body: { id: 7 } });
		expect(fetchMock).toHaveBeenCalledWith('/ext/my-ext/api/items', {
			method: 'POST',
			body: JSON.stringify({ id: 7 }),
			headers: { 'Content-Type': 'application/json' },
		});
	});

	it('throws a descriptive error on non-OK responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: async () => 'boom',
			})),
		);

		const bridge = new ExtBridge();
		await expect(bridge.request('/status')).rejects.toThrow(
			/\/ext\/my-ext\/api\/status → 500: boom/,
		);
	});
});
