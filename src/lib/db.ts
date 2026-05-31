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

export interface TriggeredTaskRecord {
	id: string;
	sessionName: string;
	windowIndex: number;
	text: string;
	fireAt: number;       // when it was scheduled to fire
	createdAt: number;    // when it was scheduled
	triggeredAt: number;  // when it actually fired / was detected missed
	status: 'ok' | 'error' | 'missed';
	error?: string;
}

export interface SessionAccessRecord {
	name: string;
	lastAccessedAt: number; // ms timestamp
}

export interface PinnedViewRecord {
	sessionName: string;
	windowIndex?: number; // omitted = session-level pin
	pinnedAt: number;
}

export interface WatchedPaneRecord {
	paneId: string;        // stable tmux pane id, e.g. "%5"
	sessionName: string;
	windowIndex: number;
	paneIndex: number;
	watchedAt: number;     // ms timestamp
}

export interface DbSchema {
	notes: NoteRecord[];
	scheduledTasks: StoredTask[];
	triggeredTasks: TriggeredTaskRecord[];
	sessionAccess: SessionAccessRecord[];
	pinnedViews: PinnedViewRecord[];
	watchedPanes: WatchedPaneRecord[];
}

const dbDir = getDataRoot();
mkdirSync(dbDir, { recursive: true });

export const db = new Low<DbSchema>(
	new JSONFile<DbSchema>(join(dbDir, 'db.json')),
	{ notes: [], scheduledTasks: [], triggeredTasks: [], sessionAccess: [], pinnedViews: [], watchedPanes: [] },
);
