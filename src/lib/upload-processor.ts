import type { ExtManifest } from './ext-loader.js';
import { requestExtensionBackend } from './ext-loader.js';
import type { TmuxWebSettings } from './settings.js';
import { validateUploadedImage } from './image-upload.js';
import { recordUploadProcessingLog } from './upload-processing-logs.js';

export interface UploadProcessorInput {
	sessionName: string;
	data: Buffer;
	mime: string;
	filename?: string;
	settings: TmuxWebSettings['imageUploadProcessor'];
	extensions: ExtManifest[];
}

export interface UploadProcessorOutput {
	data: Buffer;
	mime: string;
}

function clampQuality(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 85;
	return Math.min(100, Math.max(1, Math.round(value)));
}

function resolveFormat(value: string | undefined): 'webp' | 'jpeg' {
	return value === 'jpeg' ? 'jpeg' : 'webp';
}

function findProcessorExtension(settings: TmuxWebSettings['imageUploadProcessor'], extensions: ExtManifest[]): ExtManifest | null {
	const id = settings?.extensionId?.trim();
	if (!id) return null;
	return extensions.find((ext) => ext.id === id && ext.capabilities?.imageUploadProcessor && ext._socket) ?? null;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export function listImageUploadProcessors(extensions: ExtManifest[]): Array<{ id: string; name: string }> {
	return extensions
		.filter((ext) => Boolean(ext.capabilities?.imageUploadProcessor && ext._socket))
		.map((ext) => ({ id: ext.id, name: ext.name }));
}

export async function processImageUpload(input: UploadProcessorInput): Promise<UploadProcessorOutput> {
	const ext = findProcessorExtension(input.settings, input.extensions);
	if (!ext) {
		const configuredId = input.settings?.extensionId?.trim();
		if (configuredId) {
			await recordUploadProcessingLog({
				sessionName: input.sessionName,
				extensionId: configuredId,
				status: 'fallback',
				inputMime: input.mime,
				inputBytes: input.data.length,
				error: 'configured processor extension is not loaded',
			});
		}
		return { data: input.data, mime: input.mime };
	}

	const capability = ext.capabilities?.imageUploadProcessor;
	if (!capability) return { data: input.data, mime: input.mime };

	const format = resolveFormat(input.settings?.format);
	const quality = clampQuality(input.settings?.quality);
	try {
		const result = await requestExtensionBackend(
			ext._socket!,
			'POST',
			capability.endpoint,
			{
				'content-type': input.mime,
				'x-tmux-web-upload-session': input.sessionName,
				'x-tmux-web-upload-filename': input.filename ?? '',
				'x-tmux-web-upload-format': format,
				'x-tmux-web-upload-quality': String(quality),
			},
			input.data,
			capability.timeoutMs ?? 10_000,
		);

		if (result.status < 200 || result.status >= 300) {
			throw new Error(`processor returned ${result.status}`);
		}

		const outputMime = result.contentType.split(';')[0]?.trim().toLowerCase();
		if (!outputMime) throw new Error('processor response missing content-type');
		validateUploadedImage(result.body, outputMime);

		const status = result.body.equals(input.data) && outputMime === input.mime ? 'unchanged' : 'processed';
		await recordUploadProcessingLog({
			sessionName: input.sessionName,
			extensionId: ext.id,
			status,
			inputMime: input.mime,
			inputBytes: input.data.length,
			outputMime,
			outputBytes: result.body.length,
		});

		return { data: result.body, mime: outputMime };
	} catch (err) {
		const message = errorMessage(err);
		console.warn(`[upload-processor:${ext.id}] ${message}`);
		await recordUploadProcessingLog({
			sessionName: input.sessionName,
			extensionId: ext.id,
			status: 'fallback',
			inputMime: input.mime,
			inputBytes: input.data.length,
			error: message,
		});
		return { data: input.data, mime: input.mime };
	}
}
