import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getSettingsPath } from './state-paths.js';

export interface TmuxWebSettings {
	plugins?: string[];
	commandbar?: boolean;
}

const CONFIG_PATH = getSettingsPath();

export async function readSettings(): Promise<TmuxWebSettings> {
	try {
		return JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as TmuxWebSettings;
	} catch {
		return {};
	}
}

export async function writeSettings(cfg: TmuxWebSettings): Promise<void> {
	await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
	await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}
