import { execFileSync } from 'node:child_process';

const TMUX_TIMEOUT_MS = 3000;

export interface ActivePaneInfo {
  paneId: string;
  paneIndex: number;
  windowIndex: number;
  panePath: string;
  paneCommand: string;
  alternateOn: boolean;
  target: string;
}

const PANE_FORMAT =
  '#{pane_id}\t#{pane_index}\t#{window_index}\t#{pane_current_path}\t#{pane_current_command}\t#{alternate_on}\t#{pane_pid}';

function tmux(args: string[]): string {
  return execFileSync('tmux', args, { encoding: 'utf-8', timeout: TMUX_TIMEOUT_MS }).trimEnd();
}

function resolvePanePath(reportedPath: string, pid: number): string {
  if (reportedPath?.trim()) return reportedPath.trim();
  if (!Number.isFinite(pid) || pid <= 0) return '';

  try {
    const out = execFileSync(
      'lsof',
      ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
      { encoding: 'utf-8', timeout: TMUX_TIMEOUT_MS },
    );
    for (const line of out.split('\n')) {
      if (line.startsWith('n')) return line.slice(1).trim();
    }
  } catch {
    // lsof unavailable or permission denied
  }

  return '';
}

export function getActivePaneInfo(session: string): ActivePaneInfo | null {
  try {
    const out = tmux(['display-message', '-p', '-t', session, '-F', PANE_FORMAT]);
    const [paneId, paneIndex, windowIndex, panePath, paneCommand, alternateOn, panePid] = out.split('\t');
    if (!paneId) return null;
    const winIdx = parseInt(windowIndex, 10);
    const pIdx = parseInt(paneIndex, 10);
    const pid = parseInt(panePid ?? '', 10);
    return {
      paneId,
      paneIndex: Number.isFinite(pIdx) ? pIdx : 0,
      windowIndex: Number.isFinite(winIdx) ? winIdx : 0,
      panePath: resolvePanePath(panePath ?? '', pid),
      paneCommand: paneCommand ?? '',
      alternateOn: alternateOn === '1',
      target: `${session}:${winIdx}.${pIdx}`,
    };
  } catch {
    return null;
  }
}

export function sendKeysToPane(target: string, text: string): void {
  execFileSync('tmux', ['send-keys', '-t', target, '-l', text], { timeout: 5000 });
  execFileSync('tmux', ['send-keys', '-t', target, 'Enter'], { timeout: 5000 });
}

export function capturePaneTail(target: string, lines: number): string {
  try {
    return execFileSync(
      'tmux',
      ['capture-pane', '-t', target, '-p', '-S', String(-lines)],
      { encoding: 'utf-8', timeout: TMUX_TIMEOUT_MS },
    );
  } catch {
    return '';
  }
}
