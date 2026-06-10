import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getUploadsRoot } from './state-paths.js';

const MIME_TO_EXT: Record<string, string> = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/webp': '.webp',
	'image/gif': '.gif',
};

export class ImageUploadError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 413,
	) {
		super(message);
		this.name = 'ImageUploadError';
	}
}

function parseMaxUploadBytes(): number {
	const raw = process.env.TMUX_WEB_MAX_IMAGE_UPLOAD_BYTES;
	if (!raw) return 10 * 1024 * 1024;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : 10 * 1024 * 1024;
}

const MAX_UPLOAD_BYTES = parseMaxUploadBytes();

function sniffMime(buf: Buffer): string | null {
	if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		return 'image/png';
	}
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
		return 'image/jpeg';
	}
	if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF87a') return 'image/gif';
	if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF89a') return 'image/gif';
	if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
		return 'image/webp';
	}
	return null;
}

function resolveMime(declared: string | undefined, buf: Buffer): string {
	const normalized = declared?.split(';')[0]?.trim().toLowerCase();
	if (normalized && MIME_TO_EXT[normalized]) {
		const sniffed = sniffMime(buf);
		if (sniffed && sniffed !== normalized) {
			throw new ImageUploadError('file content does not match declared type', 400);
		}
		return normalized;
	}
	const sniffed = sniffMime(buf);
	if (sniffed) return sniffed;
	throw new ImageUploadError('unsupported image type', 400);
}

export function validateUploadedImage(
	data: Buffer,
	declaredMime?: string,
): { mime: string; ext: string } {
	if (data.length === 0) {
		throw new ImageUploadError('empty file', 400);
	}
	if (data.length > MAX_UPLOAD_BYTES) {
		throw new ImageUploadError(`file exceeds ${MAX_UPLOAD_BYTES} bytes`, 413);
	}

	const mime = resolveMime(declaredMime, data);
	return { mime, ext: MIME_TO_EXT[mime] };
}

function localDateFolder(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export async function saveUploadedImage(
	data: Buffer,
	declaredMime?: string,
): Promise<{ path: string }> {
	const { mime, ext } = validateUploadedImage(data, declaredMime);
	const dateDir = localDateFolder();
	const dir = path.join(getUploadsRoot(), dateDir);
	await mkdir(dir, { recursive: true, mode: 0o700 });

	const filename = `${randomUUID()}${ext}`;
	const filePath = path.join(dir, filename);
	await writeFile(filePath, data, { mode: 0o600 });

	return { path: filePath };
}
