import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = {
	pinnedViews: [] as Array<{ sessionName: string; windowIndex?: number; pinnedAt: number }>,
};

vi.mock('../src/lib/db.js', () => ({
	db: {
		get data() {
			return dbState;
		},
		write: vi.fn(async () => {}),
	},
}));

vi.mock('../src/lib/tmux-windows.js', () => ({
	listSessionWindows: vi.fn(() => []),
}));

import { db } from '../src/lib/db.js';
import { listSessionWindows } from '../src/lib/tmux-windows.js';
import { pinView, unpinView, listPinnedViews, viewKey } from '../src/lib/pinned-views.js';
import { buildSidebarSessions } from '../src/lib/sessions-sidebar.js';
import { renderTerminal } from '../src/lib/pages/terminal.js';
import { vscodeTheme } from '../src/lib/themes/index.js';

describe('pinned views', () => {
	beforeEach(() => {
		dbState.pinnedViews = [];
		vi.mocked(db.write).mockClear();
	});

	it('builds stable view keys for session and window pins', () => {
		expect(viewKey('foo')).toBe('foo');
		expect(viewKey('foo', 2)).toBe('foo:2');
	});

	it('pins and unpins session views idempotently', async () => {
		await pinView('alpha');
		expect(listPinnedViews()).toHaveLength(1);
		expect(listPinnedViews()[0].sessionName).toBe('alpha');

		await pinView('alpha');
		expect(listPinnedViews()).toHaveLength(1);
		expect(db.write).toHaveBeenCalledTimes(2);

		await unpinView('alpha');
		expect(listPinnedViews()).toHaveLength(0);
	});

	it('keeps session and window pins distinct', async () => {
		await pinView('alpha');
		await pinView('alpha', 2);

		expect(listPinnedViews()).toHaveLength(2);

		await unpinView('alpha', 2);
		expect(listPinnedViews()).toHaveLength(1);
		expect(listPinnedViews()[0].windowIndex).toBeUndefined();
	});
});

describe('buildSidebarSessions', () => {
	beforeEach(() => {
		dbState.pinnedViews = [];
		vi.mocked(listSessionWindows).mockReset();
		vi.mocked(listSessionWindows).mockReturnValue([]);
	});

	it('orders pinned by pinnedAt and recent by last accessed', () => {
		const sessions = [
			{ name: 'alpha', windows: 1, attached: false },
			{ name: 'beta', windows: 2, attached: true },
			{ name: 'gamma', windows: 1, attached: false },
		];
		const accessMap = new Map([
			['alpha', 300],
			['beta', 200],
			['gamma', 100],
		]);
		const pinnedViews = [
			{ sessionName: 'beta', pinnedAt: 50 },
			{ sessionName: 'alpha', windowIndex: 2, pinnedAt: 100 },
		];

		const payload = buildSidebarSessions(sessions, accessMap, pinnedViews);

		expect(payload.pinned.map((view) => viewKey(view.sessionName, view.windowIndex))).toEqual([
			'alpha:2',
			'beta',
		]);
		expect(payload.recent.map((session) => session.name)).toEqual(['alpha', 'gamma']);
	});

	it('marks missing window pins when the window no longer exists', () => {
		vi.mocked(listSessionWindows).mockReturnValue([
			{ index: 0, name: 'shell', active: true },
		]);

		const payload = buildSidebarSessions(
			[{ name: 'dev', windows: 1, attached: true }],
			new Map(),
			[{ sessionName: 'dev', windowIndex: 9, pinnedAt: 1 }],
		);

		expect(payload.pinned[0].missing).toBe(true);
	});

	it('dedupes session-level pins from recent sessions', () => {
		const payload = buildSidebarSessions(
			[{ name: 'alpha', windows: 1, attached: false }],
			new Map([['alpha', 100]]),
			[{ sessionName: 'alpha', pinnedAt: 50 }],
		);

		expect(payload.pinned).toHaveLength(1);
		expect(payload.recent).toHaveLength(0);
	});
});

describe('terminal page', () => {
	it('renders the sessions toggle before the tmux home link', () => {
		const html = renderTerminal('dev', [], { theme: vscodeTheme });
		const toggleIndex = html.indexOf('id="sessions-toggle"');
		const tmuxIndex = html.indexOf('<h1><a href="/" aria-label="Go to home">tmux</a></h1>');

		expect(toggleIndex).toBeGreaterThan(-1);
		expect(tmuxIndex).toBeGreaterThan(toggleIndex);
	});
});
