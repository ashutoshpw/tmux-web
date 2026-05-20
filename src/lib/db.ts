import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDataRoot } from './state-paths.js';

export interface NoteRecord {
	scope: string;     // "__global__" | "session:name"
	content: string;
	updatedAt: number; // ms timestamp
}

export interface StoredTask {
	id: string;
	sessionName: string;
	windowIndex: number;
	text: string;
	fireAt: number;    // ms timestamp
	createdAt: number;
}

export interface SessionAccessRecord {
	name: string;
	lastAccessedAt: number; // ms timestamp
}

interface DbSchema {
	notes: NoteRecord[];
	scheduledTasks: StoredTask[];
	sessionAccess: SessionAccessRecord[];
}

const dbDir = getDataRoot();
mkdirSync(dbDir, { recursive: true });

export const db = new Low<DbSchema>(
	new JSONFile<DbSchema>(join(dbDir, 'db.json')),
	{ notes: [], scheduledTasks: [], sessionAccess: [] },
);
