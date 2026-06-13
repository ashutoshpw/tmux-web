import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickCommandRecord } from '../src/lib/db.js';

const dbState = {
	quickCommands: [] as QuickCommandRecord[],
};

vi.mock('../src/lib/db.js', () => ({
	db: {
		get data() {
			return dbState;
		},
		write: vi.fn(async () => {}),
	},
}));

import { db } from '../src/lib/db.js';
import {
	createQuickCommand,
	deleteQuickCommand,
	listQuickCommands,
	updateQuickCommand,
	validateQuickCommandInput,
} from '../src/lib/quick-commands.js';
import { renderQuickCommandsPage } from '../src/lib/pages/quick-commands.js';
import { renderTerminal } from '../src/lib/pages/terminal.js';
import { vscodeTheme } from '../src/lib/themes/index.js';

describe('quick commands helpers', () => {
	beforeEach(() => {
		dbState.quickCommands = [];
		vi.mocked(db.write).mockClear();
	});

	it('validates required fields and trims surrounding form whitespace', () => {
		expect(validateQuickCommandInput({ title: '', command: 'bun test' })).toEqual({ ok: false, error: 'title is required' });
		expect(validateQuickCommandInput({ title: 'Tests', command: '' })).toEqual({ ok: false, error: 'command is required' });
		expect(validateQuickCommandInput({ title: ' Tests ', command: ' bun test ', description: ' CI ' })).toEqual({
			ok: true,
			title: 'Tests',
			command: 'bun test',
			description: 'CI',
		});
	});

	it('creates, sorts, updates, and deletes commands', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(1000);
			const first = await createQuickCommand({ title: 'Tests', command: 'bun test' });
			expect('error' in first).toBe(false);

			vi.setSystemTime(2000);
			const second = await createQuickCommand({ title: 'Build', command: 'bun run build' });
			expect('error' in second).toBe(false);

			expect(listQuickCommands().map((command) => command.title)).toEqual(['Build', 'Tests']);

			vi.setSystemTime(3000);
			const updated = await updateQuickCommand((first as QuickCommandRecord).id, {
				title: 'Typecheck',
				command: 'bun run typecheck',
			});
			expect('error' in updated).toBe(false);
			expect(listQuickCommands().map((command) => command.title)).toEqual(['Typecheck', 'Build']);

			await expect(deleteQuickCommand((second as QuickCommandRecord).id)).resolves.toBe(true);
			await expect(deleteQuickCommand('missing')).resolves.toBe(false);
			expect(listQuickCommands().map((command) => command.title)).toEqual(['Typecheck']);
			expect(db.write).toHaveBeenCalledTimes(4);
		} finally {
			vi.useRealTimers();
		}
	});

	it('returns not found for missing updates', async () => {
		await expect(updateQuickCommand('missing', { title: 'Nope', command: 'echo nope' })).resolves.toEqual({
			error: 'not found',
			status: 404,
		});
	});
});

describe('quick commands rendering', () => {
	it('renders the terminal commandbar quick commands subview data', () => {
		const html = renderTerminal('dev', [], {
			theme: vscodeTheme,
			commandbarEnabled: true,
			commandbarSessions: [],
			quickCommands: [{ id: 'cmd-1', title: 'Tests', command: 'bun test', description: 'Run test suite' }],
		});

		expect(html).toContain('Quick Commands');
		expect(html).toContain('Paste configured command');
		expect(html).toContain('subView":"quickCommands"');
		expect(html).toContain('cmdbar-row-chevron');
		expect(html).toContain('bun test');
	});

	it('escapes hostile quick command content on the configuration page', () => {
		const hostile = {
			id: 'cmd-1',
			title: 'bad"><script>alert(1)</script>',
			command: 'echo </textarea><script>alert(2)</script>',
			description: 'desc"><script>alert(3)</script>',
			createdAt: 1,
			updatedAt: 1,
		};

		const html = renderQuickCommandsPage([hostile], vscodeTheme);

		expect(html).toContain('bad&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('echo &lt;/textarea&gt;&lt;script&gt;alert(2)&lt;/script&gt;');
		expect(html).toContain('desc&quot;&gt;&lt;script&gt;alert(3)&lt;/script&gt;');
		expect(html).not.toContain(hostile.title);
		expect(html).not.toContain(hostile.command);
		expect(html).not.toContain(hostile.description);
	});

	it('renders configured commands as compact cards edited from a drawer', () => {
		const html = renderQuickCommandsPage([
			{
				id: 'cmd-1',
				title: 'Tests',
				command: 'bun test',
				description: 'Run test suite',
				createdAt: 1,
				updatedAt: 1,
			},
		], vscodeTheme);

		expect(html).toContain('class="quick-item"');
		expect(html).toContain('class="quick-icon-btn quick-edit"');
		expect(html).toContain('id="quick-edit-drawer"');
		expect(html).toContain('class="quick-drawer resizable-drawer"');
		expect(html).toContain('class="drawer-resize-handle"');
		expect(html).toContain('tmux-web:drawer-width:quick-commands');
		expect(html).toContain('id="quick-edit-form"');
		expect(html).toContain('id="quick-add"');
		expect(html).not.toContain('id="quick-create"');
		expect(html).not.toContain('<form class="quick-card" data-id="cmd-1"');
	});
});
