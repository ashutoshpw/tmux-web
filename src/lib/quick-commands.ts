import { randomUUID } from 'node:crypto';
import { db, type QuickCommandRecord } from './db.js';

export type QuickCommandInput = {
	title?: unknown;
	command?: unknown;
	description?: unknown;
};

export type QuickCommandValidation =
	| { ok: true; title: string; command: string; description?: string }
	| { ok: false; error: string };

function ensureStore(): QuickCommandRecord[] {
	db.data.quickCommands ??= [];
	return db.data.quickCommands;
}

export function listQuickCommands(): QuickCommandRecord[] {
	return [...ensureStore()].sort((a, b) => {
		if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
		return a.title.localeCompare(b.title);
	});
}

export function validateQuickCommandInput(input: QuickCommandInput): QuickCommandValidation {
	const title = typeof input.title === 'string' ? input.title.trim() : '';
	const command = typeof input.command === 'string' ? input.command.trim() : '';
	const description = typeof input.description === 'string' ? input.description.trim() : '';

	if (!title) return { ok: false, error: 'title is required' };
	if (!command) return { ok: false, error: 'command is required' };
	if (title.length > 120) return { ok: false, error: 'title must be 120 characters or fewer' };
	if (command.length > 40960) return { ok: false, error: 'command must be 40960 characters or fewer' };
	if (description.length > 240) return { ok: false, error: 'description must be 240 characters or fewer' };

	return {
		ok: true,
		title,
		command,
		...(description ? { description } : {}),
	};
}

export async function createQuickCommand(input: QuickCommandInput): Promise<QuickCommandRecord | { error: string }> {
	const parsed = validateQuickCommandInput(input);
	if (!parsed.ok) return { error: parsed.error };

	const now = Date.now();
	const command: QuickCommandRecord = {
		id: randomUUID(),
		title: parsed.title,
		command: parsed.command,
		description: parsed.description,
		createdAt: now,
		updatedAt: now,
	};
	ensureStore().push(command);
	await db.write();
	return command;
}

export async function updateQuickCommand(id: string, input: QuickCommandInput): Promise<QuickCommandRecord | { error: string; status: number }> {
	const parsed = validateQuickCommandInput(input);
	if (!parsed.ok) return { error: parsed.error, status: 400 };

	const commands = ensureStore();
	const idx = commands.findIndex((command) => command.id === id);
	if (idx < 0) return { error: 'not found', status: 404 };

	const updated: QuickCommandRecord = {
		...commands[idx],
		title: parsed.title,
		command: parsed.command,
		description: parsed.description,
		updatedAt: Date.now(),
	};
	commands[idx] = updated;
	await db.write();
	return updated;
}

export async function deleteQuickCommand(id: string): Promise<boolean> {
	const commands = ensureStore();
	const before = commands.length;
	db.data.quickCommands = commands.filter((command) => command.id !== id);
	if (db.data.quickCommands.length === before) return false;
	await db.write();
	return true;
}
