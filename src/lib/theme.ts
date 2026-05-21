import type { ShellTheme } from './themes/types.js';
import { vscodeTheme } from './themes/vscode.js';

export function cssVarsStyle(shell: ShellTheme = vscodeTheme.shell): string {
	return `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: ${shell.pageBg};
    --page-fg: ${shell.pageFg};
    --panel-bg: ${shell.panelBg};
    --panel-border: ${shell.panelBorder};
    --panel-muted: ${shell.panelMuted};
    --panel-accent: ${shell.panelAccent};
    --panel-success: ${shell.panelSuccess};
    --terminal-bg: ${shell.terminalBg};
    --header-gradient: ${shell.headerGradient ?? 'none'};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }`;
}
