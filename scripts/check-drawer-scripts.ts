/**
 * Validates inline drawer scripts that are concatenated in the terminal page module.
 * Catches duplicate top-level declarations (e.g. fetchWindows) before runtime.
 */
import { notesDrawerScript } from '../src/lib/notes-drawer.js';
import { schedulerDrawerScript } from '../src/lib/scheduler-drawer.js';
import { windowsDrawerScript } from '../src/lib/windows-drawer.js';
import { sessionsDrawerScript } from '../src/lib/sessions-drawer.js';

const SESSION = '__drawer_check__';

function assertParses(label: string, code: string): void {
	try {
		// Same scope model as terminal.ts: all drawer fragments in one module block.
		new Function(code);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[check:drawer-scripts] ${label}: ${message}`);
		process.exit(1);
	}
}

const combined = [
	notesDrawerScript(`session:${SESSION}`),
	schedulerDrawerScript(SESSION),
	windowsDrawerScript(SESSION),
	sessionsDrawerScript(SESSION),
].join('\n\n');

assertParses('combined drawer scripts', combined);
console.log('[check:drawer-scripts] OK');
