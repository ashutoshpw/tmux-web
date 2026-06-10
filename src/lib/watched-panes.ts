import { db, type WatchedPaneRecord } from './db.js';

/** Max panes we remember / watch. Keeps compute bounded (one ps snapshot +
 * one capture-pane per watched pane per probe). */
export const MAX_WATCHED_PANES = 50;

/**
 * Record a pane the user just navigated to. Dedupes by stable `paneId`,
 * moves it to the front (most-recent first), and caps the list at
 * {@link MAX_WATCHED_PANES}.
 */
export async function recordWatchedPane(rec: Omit<WatchedPaneRecord, 'watchedAt'>): Promise<void> {
	const next: WatchedPaneRecord = { ...rec, watchedAt: Date.now() };
	const rest = db.data.watchedPanes.filter((r) => r.paneId !== rec.paneId);
	db.data.watchedPanes = [next, ...rest].slice(0, MAX_WATCHED_PANES);
	await db.write();
}

/** Watched panes, most-recently-viewed first. */
export function getWatchedPanes(): WatchedPaneRecord[] {
	return db.data.watchedPanes;
}

/**
 * Drop records whose pane no longer exists. `aliveIds` is the set of pane ids
 * still present across the watched sessions. No-op (no write) if nothing changes.
 */
export async function pruneWatchedPanes(aliveIds: Set<string>): Promise<void> {
	const before = db.data.watchedPanes.length;
	db.data.watchedPanes = db.data.watchedPanes.filter((r) => aliveIds.has(r.paneId));
	if (db.data.watchedPanes.length !== before) await db.write();
}
