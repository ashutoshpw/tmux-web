import { Hono } from 'hono';
import { serve, createAdaptorServer } from '@hono/node-server';
import { unlinkSync } from 'node:fs';
import {
	SUPPORTED_INPUTS,
	clampQualityValue,
	compressImageUpload,
	resolveOutputFormat,
} from './compress.js';

const app = new Hono();

function normalizeMime(value: string | undefined): string {
	return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function clampQuality(value: string | undefined): number {
	return clampQualityValue(Number(value));
}

function imageResponse(data: Buffer, mime: string) {
	const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	return new Response(body, {
		status: 200,
		headers: { 'Content-Type': mime },
	});
}

app.post('/image-upload/process', async (c) => {
	const inputMime = normalizeMime(c.req.header('content-type'));
	if (!SUPPORTED_INPUTS.has(inputMime)) {
		return c.json({ error: 'unsupported image type' }, 415);
	}

	const input = Buffer.from(await c.req.arrayBuffer());
	const format = resolveOutputFormat(c.req.header('x-tmux-web-upload-format'));
	const quality = clampQuality(c.req.header('x-tmux-web-upload-quality'));

	try {
		const result = await compressImageUpload({ input, inputMime, format, quality });
		return imageResponse(result.data, result.mime);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ error: message }, 422);
	}
});

const sockPath = process.env.EXT_SOCKET;

if (sockPath) {
	try { unlinkSync(sockPath); } catch {}
	const server = createAdaptorServer({ fetch: app.fetch });
	server.listen(sockPath, () => console.log(`[image-compressor ext] listening on ${sockPath}`));
} else {
	const port = parseInt(process.env.EXT_PORT ?? '4102', 10);
	serve({ fetch: app.fetch, port }, () => console.log(`[image-compressor ext] running on :${port}`));
}
