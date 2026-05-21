import { describe, expect, it, vi } from 'vitest';
import { SchedulerService, isValidScheduleInput } from '../src/lib/scheduler.js';
import type { DbSchema } from '../src/lib/db.js';

function createDb(initial?: Partial<DbSchema>) {
	return {
		data: {
			notes: [],
			scheduledTasks: [],
			sessionAccess: [],
			...initial,
		},
		write: vi.fn(async () => {}),
	};
}

describe('SchedulerService', () => {
	it('validates schedule request bodies', () => {
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: 'npm test', delayMs: 1 })).toBe(true);
		expect(isValidScheduleInput({ sessionName: '', windowIndex: 0, text: 'npm test', delayMs: 1 })).toBe(false);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: -1, text: 'npm test', delayMs: 1 })).toBe(false);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: '', delayMs: 1 })).toBe(false);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: 'npm test', delayMs: 86_400_001 })).toBe(false);
	});

	it('creates, lists, and deletes scheduled tasks with persisted state', async () => {
		const db = createDb();
		const clearTimer = vi.fn();
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-1',
			setTimer: vi.fn(() => 123 as any) as any,
			clearTimer: clearTimer as any,
			sendKeys: vi.fn(),
		});

		const task = await scheduler.create({ sessionName: 'dev', windowIndex: 2, text: 'npm test', delayMs: 5_000 });

		expect(task).toMatchObject({ id: 'task-1', sessionName: 'dev', windowIndex: 2, text: 'npm test', fireAt: 6_000, createdAt: 1_000 });
		expect(db.data.scheduledTasks).toHaveLength(1);
		expect(db.write).toHaveBeenCalledTimes(1);
		expect(scheduler.list('dev')).toEqual([{ ...task, remainingMs: 5_000 }]);

		await expect(scheduler.delete('missing')).resolves.toBe(false);
		await expect(scheduler.delete('task-1')).resolves.toBe(true);
		expect(clearTimer).toHaveBeenCalledWith(123);
		expect(db.data.scheduledTasks).toEqual([]);
		expect(db.write).toHaveBeenCalledTimes(2);
	});

	it('fires a task once and removes it from persistence', async () => {
		const db = createDb();
		const sendKeys = vi.fn();
		let callback: (() => void) | undefined;
		const scheduler = new SchedulerService({
			db,
			now: () => 10,
			createId: () => 'task-1',
			setTimer: vi.fn((cb) => {
				callback = cb;
				return 456 as any;
			}) as any,
			sendKeys,
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 1, text: 'echo ok', delayMs: 20 });
		expect(callback).toBeTypeOf('function');

		callback?.();

		expect(sendKeys).toHaveBeenCalledWith('dev', 1, 'echo ok');
		expect(db.data.scheduledTasks).toEqual([]);
		expect(scheduler.list()).toEqual([]);
		expect(db.write).toHaveBeenCalledTimes(2);
	});

	it('restores future tasks and drops missed tasks', async () => {
		const db = createDb({
			scheduledTasks: [
				{ id: 'missed', sessionName: 'old', windowIndex: 0, text: 'old', fireAt: 10, createdAt: 1 },
				{ id: 'future', sessionName: 'new', windowIndex: 1, text: 'new', fireAt: 100, createdAt: 2 },
			],
		});
		const missed = vi.fn();
		const scheduler = new SchedulerService({
			db,
			now: () => 50,
			setTimer: vi.fn(() => 789 as any) as any,
			onMissedTask: missed,
			sendKeys: vi.fn(),
		});

		await scheduler.restoreFromDb();

		expect(missed).toHaveBeenCalledWith(expect.objectContaining({ id: 'missed' }));
		expect(db.data.scheduledTasks.map((task) => task.id)).toEqual(['future']);
		expect(scheduler.list()).toEqual([expect.objectContaining({ id: 'future', remainingMs: 50 })]);
		expect(db.write).toHaveBeenCalledTimes(1);
	});
});
