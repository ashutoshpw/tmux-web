import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { notesDrawerCSS, notesDrawerHTML, notesDrawerScript } from '../notes-drawer.js';
import { escapeHtml } from '../html.js';
import {
	commandbarCSS,
	commandbarHTML,
	commandbarScript,
	type CommandbarSession,
	type CommandbarAction,
} from '../commandbar.js';
import {
	sharedLayoutCSS,
	sharedHeader,
	sharedSidebar,
	newSessionModalHTML,
	newSessionModalScript,
} from '../shared-layout.js';

type TmuxSession = { name: string; windows: number; attached: boolean };

function formatRelativeTime(ts: number): string {
	const diffMs = Date.now() - ts;
	if (diffMs < 0) return 'just now';

	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

	if (seconds < 45) return 'just now';
	if (minutes < 60) return rtf.format(-minutes, 'minute');
	if (hours < 24) return rtf.format(-hours, 'hour');
	if (days < 7) return rtf.format(-days, 'day');
	if (weeks < 5) return rtf.format(-weeks, 'week');
	if (months < 12) return rtf.format(-months, 'month');
	return rtf.format(-years, 'year');
}

function sortSessionsForView(
	sessions: TmuxSession[],
	view: 'default' | 'recent',
	accessMap: Map<string, number>,
): TmuxSession[] {
	if (view === 'default') return sessions;

	const accessed: TmuxSession[] = [];
	const unvisited: TmuxSession[] = [];

	for (const s of sessions) {
		if (accessMap.has(s.name)) accessed.push(s);
		else unvisited.push(s);
	}

	accessed.sort((a, b) => (accessMap.get(b.name) ?? 0) - (accessMap.get(a.name) ?? 0));
	return [...accessed, ...unvisited];
}

function sessionMeta(s: TmuxSession, view: 'default' | 'recent', accessMap: Map<string, number>): string {
	const windows = `${s.windows} window${s.windows !== 1 ? 's' : ''}`;
	const attached = s.attached ? ' &middot; attached' : '';
	if (view === 'default') return `${windows}${attached}`;

	const accessedAt = accessMap.get(s.name);
	if (accessedAt) return `${windows}${attached} &middot; ${formatRelativeTime(accessedAt)}`;
	return `${windows}${attached}`;
}

export function renderLanding(
	sessions: TmuxSession[],
	opts: {
		view: 'default' | 'recent';
		accessMap: Map<string, number>;
		commandbarEnabled?: boolean;
		commandbarSessions?: CommandbarSession[];
		agentsEnabled?: boolean;
		theme: TmuxWebTheme;
	},
): string {
	const { view, accessMap, commandbarEnabled = false, commandbarSessions = [], agentsEnabled = false, theme } = opts;
	const sorted = sortSessionsForView(sessions, view, accessMap);
	const commandbarActions: CommandbarAction[] = [
		{ label: 'Open notes', meta: 'Global notes', clickTargetId: 'notes-toggle' },
	];
	if (agentsEnabled) {
		commandbarActions.push({ label: 'View All Agents', meta: 'Running agents', href: '/agents' });
	}

	const rows = sorted
		.map(
			(s) =>
					`<a href="/s/${encodeURIComponent(s.name)}" class="session-row">
      <span class="name">${escapeHtml(s.name)}</span>
      <span class="meta">${sessionMeta(s, view, accessMap)}</span>
    </a>`,
		)
		.join('\n');

	const empty = sessions.length === 0
		? `<p class="empty">No tmux sessions found.<br>Create one with <code>tmux new -s mysession</code><br>or use the <strong>New Session</strong> button.</p>`
		: '';

	const refreshHref = view === 'recent' ? '/?view=recent' : '/';
	const defaultActive = view === 'default' ? ' active' : '';
	const recentActive = view === 'recent' ? ' active' : '';

	const pageSpecificCSS = `
  .session-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 8px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s;
  }
  .session-row:hover { border-color: var(--panel-success); }
  .session-row .name { font-size: 14px; font-weight: 500; color: var(--panel-accent); }
  .session-row .meta { font-size: 11px; color: var(--panel-muted); text-align: right; }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.7; }
  .empty code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .empty strong { color: var(--panel-accent); font-weight: 500; }
  .view-tabs {
    display: flex; gap: 0; margin-bottom: 20px;
    border-bottom: 1px solid var(--panel-border);
  }
  .view-tabs .tab {
    font-size: 12px; color: var(--panel-muted); text-decoration: none;
    padding: 8px 16px; border-bottom: 2px solid transparent;
    margin-bottom: -1px; transition: color 0.15s, border-color 0.15s;
  }
  .view-tabs .tab:hover { color: var(--panel-accent); }
  .view-tabs .tab.active { color: var(--panel-accent); border-bottom-color: var(--panel-accent); }
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${notesDrawerCSS()}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'TMUX Sessions' })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'home', agentsEnabled, refreshHref })}
    <main class="main-panel">
      <nav class="view-tabs">
        <a href="/" class="tab${defaultActive}">Default</a>
        <a href="/?view=recent" class="tab${recentActive}">Last Updated</a>
      </nav>
      ${rows}
      ${empty}
    </main>
  </div>
</div>

${newSessionModalHTML()}
${commandbarEnabled ? commandbarHTML() : ''}
${notesDrawerHTML('Notes — Global')}

<script type="module">
${notesDrawerScript('__global__')}
${commandbarEnabled ? commandbarScript(commandbarSessions, commandbarActions) : ''}
${newSessionModalScript()}
</script>
</body>
</html>`;
}
