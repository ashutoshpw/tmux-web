import { db, type WindowHistoryRecord } from './db.js';

/** Max history entries we keep. Bounds the db + the page render. */
const MAX_WINDOW_HISTORY = 200;

/**
 * Record a window the user just landed on. Dedupes by `sessionName + windowName`
 * (so revisiting the same window moves it to the front rather than stacking),
 * keeps the list most-recent-first, and caps it at {@link MAX_WINDOW_HISTORY}.
 * Fire-and-forget — callers should not block on it.
 */
export async function recordWindowVisit(
	sessionName: string,
	windowIndex: number,
	windowName: string,
): Promise<void> {
	const list = (db.data.windowHistory ??= []);
	const next: WindowHistoryRecord = {
		sessionName,
		windowIndex,
		windowName,
		visitedAt: Date.now(),
	};
	const rest = list.filter(
		(r) => !(r.sessionName === sessionName && r.windowName === windowName),
	);
	db.data.windowHistory = [next, ...rest].slice(0, MAX_WINDOW_HISTORY);
	await db.write();
}

/** Window visit history, most-recent first. */
export function listWindowHistory(): WindowHistoryRecord[] {
	return db.data.windowHistory ?? [];
}

/** Wipe all history. No-op write avoided when already empty. */
export async function clearWindowHistory(): Promise<void> {
	if (!(db.data.windowHistory ?? []).length) return;
	db.data.windowHistory = [];
	await db.write();
}
