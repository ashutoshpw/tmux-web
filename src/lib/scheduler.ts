import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { DbSchema, StoredTask } from './db.js';

export interface ScheduledTask extends StoredTask {
	timeoutHandle: ReturnType<typeof setTimeout>;
}

export interface ScheduleTaskInput {
	sessionName: string;
	windowIndex: number;
	text: string;
	delayMs: number;
}

export interface ScheduleTaskView extends StoredTask {
	remainingMs: number;
}

export interface SchedulerDeps {
	db: { data: DbSchema; write(): Promise<void> };
	now?: () => number;
	setTimer?: typeof setTimeout;
	clearTimer?: typeof clearTimeout;
	createId?: () => string;
	sendKeys?: (sessionName: string, windowIndex: number, text: string) => void;
	onError?: (err: unknown) => void;
	onMissedTask?: (task: StoredTask) => void;
}

export function sendTmuxKeys(sessionName: string, windowIndex: number, text: string): void {
	const target = `${sessionName}:${windowIndex}`;
	execFileSync('tmux', ['send-keys', '-t', target, '-l', text], { timeout: 5000 });
	execFileSync('tmux', ['send-keys', '-t', target, 'Enter'], { timeout: 5000 });
}

export function isValidScheduleInput(input: unknown): input is ScheduleTaskInput {
	if (!input || typeof input !== 'object') return false;
	const body = input as Record<string, unknown>;
	return (
		typeof body.sessionName === 'string' && body.sessionName.length > 0 &&
		typeof body.windowIndex === 'number' && Number.isInteger(body.windowIndex) && body.windowIndex >= 0 &&
		typeof body.text === 'string' && body.text.length > 0 && body.text.length <= 4096 &&
		typeof body.delayMs === 'number' && body.delayMs >= 1 && body.delayMs <= 86_400_000
	);
}

export class SchedulerService {
	private readonly scheduledTasks = new Map<string, ScheduledTask>();
	private readonly now: () => number;
	private readonly setTimer: typeof setTimeout;
	private readonly clearTimer: typeof clearTimeout;
	private readonly createId: () => string;
	private readonly sendKeys: (sessionName: string, windowIndex: number, text: string) => void;
	private readonly onError: (err: unknown) => void;
	private readonly onMissedTask: (task: StoredTask) => void;

	constructor(private readonly deps: SchedulerDeps) {
		this.now = deps.now ?? Date.now;
		this.setTimer = deps.setTimer ?? setTimeout;
		this.clearTimer = deps.clearTimer ?? clearTimeout;
		this.createId = deps.createId ?? randomUUID;
		this.sendKeys = deps.sendKeys ?? sendTmuxKeys;
		this.onError = deps.onError ?? ((err) => console.error(err));
		this.onMissedTask = deps.onMissedTask ?? (() => {});
	}

	async restoreFromDb(): Promise<void> {
		const now = this.now();
		const missed: string[] = [];

		for (const task of this.deps.db.data.scheduledTasks) {
			if (task.fireAt <= now) {
				missed.push(task.id);
				this.onMissedTask(task);
			} else {
				this.scheduleExisting(task, task.fireAt - now);
			}
		}

		if (missed.length) {
			this.deps.db.data.scheduledTasks = this.deps.db.data.scheduledTasks.filter((t) => !missed.includes(t.id));
			await this.deps.db.write();
		}
	}

	list(sessionName?: string): ScheduleTaskView[] {
		return [...this.scheduledTasks.values()]
			.filter((task) => !sessionName || task.sessionName === sessionName)
			.map(({ id, sessionName, windowIndex, text, fireAt, createdAt }) => ({
				id,
				sessionName,
				windowIndex,
				text,
				fireAt,
				createdAt,
				remainingMs: Math.max(0, fireAt - this.now()),
			}))
			.sort((a, b) => a.fireAt - b.fireAt);
	}

	async create(input: ScheduleTaskInput): Promise<StoredTask> {
		const id = this.createId();
		const createdAt = this.now();
		const task = {
			id,
			sessionName: input.sessionName,
			windowIndex: input.windowIndex,
			text: input.text,
			fireAt: createdAt + input.delayMs,
			createdAt,
		};

		this.scheduleExisting(task, input.delayMs);
		this.deps.db.data.scheduledTasks.push(task);
		await this.deps.db.write();
		return task;
	}

	async delete(id: string): Promise<boolean> {
		const task = this.scheduledTasks.get(id);
		if (!task) return false;
		this.clearTimer(task.timeoutHandle);
		this.scheduledTasks.delete(id);
		this.deps.db.data.scheduledTasks = this.deps.db.data.scheduledTasks.filter((t) => t.id !== id);
		await this.deps.db.write();
		return true;
	}

	cleanup(): void {
		for (const task of this.scheduledTasks.values()) {
			try { this.clearTimer(task.timeoutHandle); } catch {}
		}
		this.scheduledTasks.clear();
	}

	private scheduleExisting(task: StoredTask, delayMs: number): void {
		const timeoutHandle = this.setTimer(() => this.fireTask(task), delayMs);
		this.scheduledTasks.set(task.id, { ...task, timeoutHandle });
	}

	private fireTask(task: StoredTask): void {
		try {
			this.sendKeys(task.sessionName, task.windowIndex, task.text);
		} catch (err: any) {
			this.onError(`[scheduler] send-keys to ${task.sessionName}:${task.windowIndex} failed: ${err.message ?? err}`);
		}
		this.scheduledTasks.delete(task.id);
		this.deps.db.data.scheduledTasks = this.deps.db.data.scheduledTasks.filter((t) => t.id !== task.id);
		this.deps.db.write().catch(this.onError);
	}
}
