import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtManifest } from '../src/lib/ext-loader.js';
import { listImageUploadProcessors, processImageUpload } from '../src/lib/upload-processor.js';
import { db } from '../src/lib/db.js';

const png1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZy3WQAAAABJRU5ErkJggg==',
	'base64',
);
const jpeg1x1 = Buffer.from(
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=',
	'base64',
);

function processorManifest(socketPath: string): ExtManifest {
	return {
		id: 'ext-image-compressor',
		name: 'Image Compressor',
		icon: '▣',
		slot: 'background',
		permissions: [],
		views: [],
		start: 'node dist/backend/server.js',
		config: {},
		capabilities: {
			imageUploadProcessor: {
				endpoint: '/image-upload/process',
				timeoutMs: 1000,
			},
		},
		dir: '/tmp/ext-image-compressor',
		_socket: socketPath,
	};
}

async function withSocketServer(
	handler: http.RequestListener,
	run: (socketPath: string) => Promise<void>,
): Promise<void> {
	const socketPath = path.join(os.tmpdir(), `tmux-web-test-${randomUUID()}.sock`);
	const server = http.createServer(handler);
	await new Promise<void>((resolve) => server.listen(socketPath, resolve));
	try {
		await run(socketPath);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

beforeEach(() => {
	db.data = {
		notes: [],
		scheduledTasks: [],
		triggeredTasks: [],
		sessionAccess: [],
		pinnedViews: [],
		watchedPanes: [],
		windowLabels: [],
		sessionWindows: [],
		uploadProcessingLogs: [],
	};
	vi.spyOn(db, 'write').mockResolvedValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('image upload processor', () => {
	it('lists loaded image upload processor extensions', () => {
		const manifest = processorManifest('/tmp/missing.sock');
		expect(listImageUploadProcessors([manifest])).toEqual([
			{ id: 'ext-image-compressor', name: 'Image Compressor' },
		]);
	});

	it('returns processed bytes from the selected extension', async () => {
		await withSocketServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'image/jpeg' });
			res.end(jpeg1x1);
		}, async (socketPath) => {
			const out = await processImageUpload({
				sessionName: 'dev',
				data: png1x1,
				mime: 'image/png',
				filename: 'screen.png',
				settings: { extensionId: 'ext-image-compressor', format: 'jpeg', quality: 80 },
				extensions: [processorManifest(socketPath)],
			});

			expect(out.mime).toBe('image/jpeg');
			expect(out.data.equals(jpeg1x1)).toBe(true);
			expect(db.data.uploadProcessingLogs[0]).toMatchObject({
				sessionName: 'dev',
				extensionId: 'ext-image-compressor',
				status: 'processed',
				inputMime: 'image/png',
				outputMime: 'image/jpeg',
			});
		});
	});

	it('falls back to original bytes when the processor fails', async () => {
		await withSocketServer((_req, res) => {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'boom' }));
		}, async (socketPath) => {
			const out = await processImageUpload({
				sessionName: 'dev',
				data: png1x1,
				mime: 'image/png',
				settings: { extensionId: 'ext-image-compressor' },
				extensions: [processorManifest(socketPath)],
			});

			expect(out.mime).toBe('image/png');
			expect(out.data.equals(png1x1)).toBe(true);
			expect(db.data.uploadProcessingLogs[0]).toMatchObject({
				status: 'fallback',
				error: 'processor returned 500',
			});
		});
	});

	it('logs fallback when the configured processor is not loaded', async () => {
		const out = await processImageUpload({
			sessionName: 'dev',
			data: png1x1,
			mime: 'image/png',
			settings: { extensionId: 'missing-processor' },
			extensions: [],
		});

		expect(out.mime).toBe('image/png');
		expect(out.data.equals(png1x1)).toBe(true);
		expect(db.data.uploadProcessingLogs[0]).toMatchObject({
			extensionId: 'missing-processor',
			status: 'fallback',
			error: 'configured processor extension is not loaded',
		});
	});
});
