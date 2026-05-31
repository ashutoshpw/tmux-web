const SHELL_COMMANDS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash']);

function commandBasename(command: string): string {
  const trimmed = command.trim();
  const slash = trimmed.lastIndexOf('/');
  return (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).toLowerCase();
}

function hasAgentBusyHints(screen: string): boolean {
  const lines = screen.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
  const live = lines.slice(-20);
  const liveLower = live.join('\n').toLowerCase();

  if (
    liveLower.includes('esc to interrupt')
    || liveLower.includes('ctrl+c to interrupt')
    || liveLower.includes('ctrl-c to interrupt')
  ) {
    return true;
  }

  return live.some((l) => /[❯>›]\s*\d+\.\s+\S/.test(l));
}

export interface PaneReadyInput {
  alternateOn: boolean;
  paneCommand: string;
  paneScreen?: string;
}

export function isPaneReady(input: PaneReadyInput): boolean {
  if (input.alternateOn) return false;
  if (!SHELL_COMMANDS.has(commandBasename(input.paneCommand))) return false;
  if (input.paneScreen && hasAgentBusyHints(input.paneScreen)) return false;
  return true;
}

export function paneNotReadyReason(input: PaneReadyInput): string {
  if (input.alternateOn) return 'Pane is in alternate screen mode';
  if (!SHELL_COMMANDS.has(commandBasename(input.paneCommand))) {
    return `Foreground process is not a shell (${input.paneCommand || 'unknown'})`;
  }
  if (input.paneScreen && hasAgentBusyHints(input.paneScreen)) {
    return 'An interactive agent is active in this pane';
  }
  return 'Pane is not ready';
}
