const MIN_COMPRESS_BYTES = 256 * 1024;
export const SUPPORTED_INPUTS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

interface SharpPipeline {
	rotate(): SharpPipeline;
	flatten(options: { background: string }): SharpPipeline;
	jpeg(options: { quality: number; mozjpeg: boolean }): SharpPipeline;
	webp(options: { quality: number }): SharpPipeline;
	toBuffer(): Promise<Buffer>;
}

type SharpFactory = (input: Buffer, options: { failOn: 'none' }) => SharpPipeline;

export interface CompressImageOptions {
	input: Buffer;
	inputMime: string;
	format: 'webp' | 'jpeg';
	quality: number;
	minBytes?: number;
	sharpFactory?: SharpFactory;
}

export interface CompressImageResult {
	data: Buffer;
	mime: string;
	changed: boolean;
}

export function clampQualityValue(value: number): number {
	if (!Number.isFinite(value)) return 85;
	return Math.min(100, Math.max(1, Math.round(value)));
}

export function resolveOutputFormat(value: string | undefined): 'webp' | 'jpeg' {
	return value === 'jpeg' ? 'jpeg' : 'webp';
}

async function loadSharpFactory(): Promise<SharpFactory> {
	const mod = await import(/* @vite-ignore */ 'sharp');
	return mod.default as SharpFactory;
}

export async function compressImageUpload(opts: CompressImageOptions): Promise<CompressImageResult> {
	const minBytes = opts.minBytes ?? MIN_COMPRESS_BYTES;
	if (opts.inputMime === 'image/gif' || opts.input.length < minBytes) {
		return { data: opts.input, mime: opts.inputMime, changed: false };
	}

	const sharp = opts.sharpFactory ?? await loadSharpFactory();
	let pipeline = sharp(opts.input, { failOn: 'none' }).rotate();
	let outputMime: string;
	if (opts.format === 'jpeg') {
		pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: opts.quality, mozjpeg: true });
		outputMime = 'image/jpeg';
	} else {
		pipeline = pipeline.webp({ quality: opts.quality });
		outputMime = 'image/webp';
	}

	const output = await pipeline.toBuffer();
	if (output.length >= opts.input.length) {
		return { data: opts.input, mime: opts.inputMime, changed: false };
	}
	return { data: output, mime: outputMime, changed: true };
}
