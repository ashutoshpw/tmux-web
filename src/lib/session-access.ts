import { db } from './db.js';

export async function recordSessionAccess(name: string): Promise<void> {
	const now = Date.now();
	const idx = db.data.sessionAccess.findIndex((r) => r.name === name);
	if (idx >= 0) {
		db.data.sessionAccess[idx].lastAccessedAt = now;
	} else {
		db.data.sessionAccess.push({ name, lastAccessedAt: now });
	}
	await db.write();
}

export function getSessionAccessMap(): Map<string, number> {
	const map = new Map<string, number>();
	for (const r of db.data.sessionAccess) {
		map.set(r.name, r.lastAccessedAt);
	}
	return map;
}
