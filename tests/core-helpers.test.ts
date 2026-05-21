import { homedir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCommandbarSessions } from '../src/lib/commandbar.js';
import { resolveExtensionUiFile } from '../src/lib/ext-loader.js';
import { renderLanding } from '../src/lib/pages/landing.js';
import { renderNotesPage } from '../src/lib/pages/notes-page.js';
import { renderTerminal } from '../src/lib/pages/terminal.js';
import { getConfigRoot, getDataRoot, getSettingsPath } from '../src/lib/state-paths.js';
import { vscodeTheme } from '../src/lib/themes/index.js';

const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
});

describe('core helpers', () => {
	it('orders command bar sessions by recency then name', () => {
		const sessions = [
			{ name: 'zeta', windows: 1, attached: false },
			{ name: 'alpha', windows: 2, attached: true },
			{ name: 'recent', windows: 1, attached: false },
		];
		const accessMap = new Map([['recent', 200], ['zeta', 100]]);

		expect(buildCommandbarSessions(sessions, accessMap).map((session) => session.name)).toEqual(['recent', 'zeta', 'alpha']);
	});

	it('resolves dev and prod state paths', () => {
		delete process.env.TMUX_WEB_DEV;
		delete process.env.TMUX_WEB_MODE;
		delete process.env.NODE_ENV;
		delete process.env.npm_lifecycle_event;
		expect(getDataRoot()).toBe(path.join(homedir(), '.tmux-web'));
		expect(getConfigRoot()).toBe(path.join(homedir(), '.config'));
		expect(getSettingsPath()).toBe(path.join(homedir(), '.config', 'tmux-web', 'settings.json'));

		process.env.TMUX_WEB_DEV = '1';
		expect(getDataRoot()).toBe(path.join(homedir(), '.dev', '.tmux-web'));
		expect(getConfigRoot()).toBe(path.join(homedir(), '.dev', '.config'));
		expect(getSettingsPath()).toBe(path.join(homedir(), '.dev', '.config', 'tmux-web', 'settings.json'));
	});

	it('escapes hostile session names in rendered pages', () => {
		const hostile = `bad"><script>alert(1)</script>`;
		const accessMap = new Map<string, number>();
		const landing = renderLanding([{ name: hostile, windows: 1, attached: false }], { view: 'default', accessMap, theme: vscodeTheme });
		const terminal = renderTerminal(hostile, [], { theme: vscodeTheme });
		const notes = renderNotesPage(hostile, vscodeTheme);

		expect(landing).toContain('bad&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(terminal).toContain('bad&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(notes).toContain('bad&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(landing).not.toContain(`<span class="name">${hostile}</span>`);
		expect(terminal).not.toContain(`<span class="session">${hostile}</span>`);
		expect(notes).not.toContain(`<span>${hostile}</span>`);
	});

	it('keeps extension UI paths inside dist/ui', () => {
		const uiDir = path.join('/tmp', 'tmux-web-ext', 'dist', 'ui');
		expect(resolveExtensionUiFile(uiDir, 'index.html')).toBe(path.join(uiDir, 'index.html'));
		expect(resolveExtensionUiFile(uiDir, '../server.js')).toBeNull();
		expect(resolveExtensionUiFile(uiDir, '../../secret.txt')).toBeNull();
	});
});
