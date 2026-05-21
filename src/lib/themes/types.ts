export type ThemeTemplateId = 'vscode' | 'ghostty';

export type ShellTheme = {
	pageBg: string;
	pageFg: string;
	panelBg: string;
	panelBorder: string;
	panelMuted: string;
	panelAccent: string;
	panelSuccess: string;
	terminalBg: string;
	headerGradient?: string;
};

export type TerminalTheme = {
	foreground: string;
	background: string;
	cursor: string;
	cursorAccent: string;
	selectionBackground: string;
	selectionForeground: string;
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
};

export type TmuxWebTheme = {
	template: ThemeTemplateId;
	shell: ShellTheme;
	terminal: TerminalTheme;
};
