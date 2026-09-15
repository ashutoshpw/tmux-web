import { describe, expect, it } from 'vitest';
import {
	clampQualityValue,
	compressImageUpload,
	resolveOutputFormat,
} from '../extensions/image-compressor/backend/compress.js';

describe('image compressor extension', () => {
	it('defaults output format to webp', () => {
		expect(resolveOutputFormat(undefined)).toBe('webp');
		expect(resolveOutputFormat('webp')).toBe('webp');
		expect(resolveOutputFormat('jpeg')).toBe('jpeg');
	});

	it('clamps quality', () => {
		expect(clampQualityValue(Number.NaN)).toBe(85);
		expect(clampQualityValue(-10)).toBe(1);
		expect(clampQualityValue(110)).toBe(100);
		expect(clampQualityValue(80.4)).toBe(80);
	});

	it('leaves gifs unchanged', async () => {
		const gif = Buffer.from('GIF89a010101', 'ascii');
		const result = await compressImageUpload({
			input: gif,
			inputMime: 'image/gif',
			format: 'webp',
			quality: 85,
			minBytes: 0,
		});
		expect(result.changed).toBe(false);
		expect(result.mime).toBe('image/gif');
		expect(result.data.equals(gif)).toBe(true);
	});

	it('compresses static images to the configured format when smaller', async () => {
		const input = Buffer.alloc(300_000, 1);
		const encoded = Buffer.alloc(20_000, 2);
		let webpQuality = 0;

		const result = await compressImageUpload({
			input,
			inputMime: 'image/png',
			format: 'webp',
			quality: 80,
			minBytes: 0,
			sharpFactory: () => ({
				rotate() { return this; },
				flatten() { return this; },
				jpeg() { return this; },
				webp(options) {
					webpQuality = options.quality;
					return this;
				},
				async toBuffer() {
					return encoded;
				},
			}),
		});

		expect(result.changed).toBe(true);
		expect(result.mime).toBe('image/webp');
		expect(result.data.equals(encoded)).toBe(true);
		expect(webpQuality).toBe(80);
	});
});
