import type { TmuxWebTheme } from './types.js';

/** Ghostty Tokyo Night palette (aligned with ghostty-web defaults). */
export const ghosttyTheme: TmuxWebTheme = {
	template: 'ghostty',
	shell: {
		pageBg: '#1a1b26',
		pageFg: '#a9b1d6',
		panelBg: '#1f2335',
		panelBorder: '#292e42',
		panelMuted: '#565f89',
		panelAccent: '#c0caf5',
		panelSuccess: '#9ece6a',
		terminalBg: '#1a1b26',
		headerGradient:
			'linear-gradient(180deg, rgba(31, 35, 53, 0.98), rgba(26, 27, 38, 0.98))',
	},
	terminal: {
		foreground: '#c0caf5',
		background: '#1a1b26',
		cursor: '#c0caf5',
		cursorAccent: '#1a1b26',
		selectionBackground: '#33467c',
		selectionForeground: '#c0caf5',
		black: '#15161e',
		red: '#f7768e',
		green: '#9ece6a',
		yellow: '#e0af68',
		blue: '#7aa2f7',
		magenta: '#bb9af7',
		cyan: '#7dcfff',
		white: '#a9b1d6',
		brightBlack: '#414868',
		brightRed: '#f7768e',
		brightGreen: '#9ece6a',
		brightYellow: '#e0af68',
		brightBlue: '#7aa2f7',
		brightMagenta: '#bb9af7',
		brightCyan: '#7dcfff',
		brightWhite: '#c0caf5',
	},
};
