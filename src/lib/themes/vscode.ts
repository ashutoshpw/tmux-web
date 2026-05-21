import type { TmuxWebTheme } from './types.js';

/** VS Code default dark terminal + current tmux-web shell chrome. */
export const vscodeTheme: TmuxWebTheme = {
	template: 'vscode',
	shell: {
		pageBg: '#111111',
		pageFg: '#d0d0d0',
		panelBg: '#11161d',
		panelBorder: '#243241',
		panelMuted: '#8a97a6',
		panelAccent: '#f3f7fb',
		panelSuccess: '#73c991',
		terminalBg: '#1e1e1e',
		headerGradient:
			'linear-gradient(180deg, rgba(19, 28, 36, 0.98), rgba(13, 18, 24, 0.98))',
	},
	terminal: {
		foreground: '#cccccc',
		background: '#1e1e1e',
		cursor: '#aeafad',
		cursorAccent: '#1e1e1e',
		selectionBackground: '#264f78',
		selectionForeground: '#ffffff',
		black: '#000000',
		red: '#cd3131',
		green: '#0dbc79',
		yellow: '#e5e510',
		blue: '#2472c8',
		magenta: '#bc3fbc',
		cyan: '#11a8cd',
		white: '#e5e5e5',
		brightBlack: '#666666',
		brightRed: '#f14c4c',
		brightGreen: '#23d18b',
		brightYellow: '#f5f543',
		brightBlue: '#3b8eea',
		brightMagenta: '#d670d6',
		brightCyan: '#29b8db',
		brightWhite: '#ffffff',
	},
};
