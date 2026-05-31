import { db, type PinnedViewRecord } from './db.js';

export function viewKey(sessionName: string, windowIndex?: number): string {
	return windowIndex === undefined ? sessionName : `${sessionName}:${windowIndex}`;
}

function matchesView(record: PinnedViewRecord, sessionName: string, windowIndex?: number): boolean {
	if (record.sessionName !== sessionName) return false;
	const recordWindow = record.windowIndex;
	if (windowIndex === undefined) return recordWindow === undefined;
	return recordWindow === windowIndex;
}

export function listPinnedViews(): PinnedViewRecord[] {
	return [...(db.data.pinnedViews ?? [])].sort((a, b) => b.pinnedAt - a.pinnedAt);
}

export async function pinView(sessionName: string, windowIndex?: number): Promise<void> {
	const now = Date.now();
	const views = db.data.pinnedViews ??= [];
	const idx = views.findIndex((record) => matchesView(record, sessionName, windowIndex));
	if (idx >= 0) {
		views[idx].pinnedAt = now;
	} else {
		const record: PinnedViewRecord = { sessionName, pinnedAt: now };
		if (windowIndex !== undefined) record.windowIndex = windowIndex;
		views.push(record);
	}
	await db.write();
}

export async function unpinView(sessionName: string, windowIndex?: number): Promise<void> {
	const views = db.data.pinnedViews ??= [];
	const next = views.filter((record) => !matchesView(record, sessionName, windowIndex));
	if (next.length === views.length) return;
	db.data.pinnedViews = next;
	await db.write();
}
