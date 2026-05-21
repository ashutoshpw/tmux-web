import { ghosttyTheme } from './ghostty.js';
import { vscodeTheme } from './vscode.js';
import type { ThemeTemplateId, TmuxWebTheme } from './types.js';

export type { ShellTheme, TerminalTheme, ThemeTemplateId, TmuxWebTheme } from './types.js';
export { ghosttyTheme } from './ghostty.js';
export { vscodeTheme } from './vscode.js';

const TEMPLATES: Record<ThemeTemplateId, TmuxWebTheme> = {
	vscode: vscodeTheme,
	ghostty: ghosttyTheme,
};

export const THEME_TEMPLATE_IDS = Object.keys(TEMPLATES) as ThemeTemplateId[];

export function getThemeTemplates(): Record<ThemeTemplateId, TmuxWebTheme> {
	return TEMPLATES;
}

export function resolveTheme(templateId: ThemeTemplateId): TmuxWebTheme {
	const theme = TEMPLATES[templateId];
	if (!theme) {
		throw new Error(`unknown theme template: ${templateId}`);
	}
	return structuredClone(theme);
}

export function isThemeTemplateId(value: string): value is ThemeTemplateId {
	return value === 'vscode' || value === 'ghostty';
}
