import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getThemePath } from './state-paths.js';
import {
	isThemeTemplateId,
	resolveTheme,
	type ThemeTemplateId,
	type TmuxWebTheme,
} from './themes/index.js';

const THEME_PATH = getThemePath();

function isValidTheme(data: unknown): data is TmuxWebTheme {
	if (!data || typeof data !== 'object') return false;
	const t = data as TmuxWebTheme;
	return (
		isThemeTemplateId(t.template) &&
		typeof t.shell === 'object' &&
		t.shell !== null &&
		typeof t.shell.pageBg === 'string' &&
		typeof t.terminal === 'object' &&
		t.terminal !== null &&
		typeof t.terminal.background === 'string'
	);
}

export async function writeActiveTheme(theme: TmuxWebTheme): Promise<void> {
	await mkdir(path.dirname(THEME_PATH), { recursive: true });
	await writeFile(THEME_PATH, JSON.stringify(theme, null, 2) + '\n');
}

export async function readActiveTheme(): Promise<TmuxWebTheme> {
	try {
		const raw = JSON.parse(await readFile(THEME_PATH, 'utf-8')) as unknown;
		if (isValidTheme(raw)) return raw;
	} catch {
		// missing or invalid — seed default
	}
	const defaultTheme = resolveTheme('vscode');
	await writeActiveTheme(defaultTheme);
	return defaultTheme;
}

export async function setActiveThemeTemplate(templateId: ThemeTemplateId): Promise<TmuxWebTheme> {
	const theme = resolveTheme(templateId);
	await writeActiveTheme(theme);
	return theme;
}
