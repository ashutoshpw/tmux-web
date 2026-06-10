import { randomUUID } from 'node:crypto';
import { db, type UploadProcessingLogRecord } from './db.js';

const MAX_UPLOAD_PROCESSING_LOGS = 100;

export type UploadProcessingLogInput = Omit<UploadProcessingLogRecord, 'id' | 'timestamp'>;

export async function recordUploadProcessingLog(input: UploadProcessingLogInput): Promise<void> {
	db.data.uploadProcessingLogs ??= [];
	db.data.uploadProcessingLogs.unshift({
		id: randomUUID(),
		timestamp: Date.now(),
		...input,
	});
	db.data.uploadProcessingLogs = db.data.uploadProcessingLogs.slice(0, MAX_UPLOAD_PROCESSING_LOGS);
	await db.write();
}

export function listUploadProcessingLogs(limit = 20): UploadProcessingLogRecord[] {
	db.data.uploadProcessingLogs ??= [];
	return db.data.uploadProcessingLogs.slice(0, limit);
}
