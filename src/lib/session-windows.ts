import { db, type StoredWindowEntry } from './db.js';
import { captureSessionWindowsWithPath, isGitWorktree } from './tmux-windows.js';
import { listWindowLabels } from './window-labels.js';

export type CapturedWindow = StoredWindowEntry & { active: boolean };
export type SidebarWindow = StoredWindowEntry & { label: string | null };

function storeSessionWindows(sessionName: string, windows: StoredWindowEntry[]): void {
	const records = db.data.sessionWindows ??= [];
	const record = { sessionName, windows, updatedAt: Date.now() };
	const idx = records.findIndex((r) => r.sessionName === sessionName);
	if (idx >= 0) records[idx] = record;
	else records.push(record);
	void db.write();
}

// Runs `tmux list-windows` for ONE session (the focused one) plus per-window git
// worktree detection, then persists the result to lowdb. The sidebar reads the
// persisted data via getStoredWindows() so it never spawns tmux per session.
export function captureAndStoreWindows(sessionName: string): CapturedWindow[] {
	const live = captureSessionWindowsWithPath(sessionName);
	const worktreeCache = new Map<string, boolean>();
	const captured: CapturedWindow[] = live.map((w) => {
		let worktree = worktreeCache.get(w.path);
		if (worktree === undefined) {
			worktree = isGitWorktree(w.path);
			worktreeCache.set(w.path, worktree);
		}
		return { index: w.index, name: w.name, worktree, active: w.active };
	});
	if (captured.length) {
		storeSessionWindows(
			sessionName,
			captured.map((w) => ({ index: w.index, name: w.name, worktree: w.worktree })),
		);
	}
	return captured;
}

// Sidebar data path: lowdb only, no tmux. Merges custom labels on top of the
// last-captured window list for the session.
export function getStoredWindows(sessionName: string): SidebarWindow[] {
	const record = (db.data.sessionWindows ?? []).find((r) => r.sessionName === sessionName);
	if (!record) return [];
	const labels = new Map(listWindowLabels(sessionName).map((l) => [l.windowIndex, l.label]));
	return record.windows.map((w) => ({ ...w, label: labels.get(w.index) ?? null }));
}
