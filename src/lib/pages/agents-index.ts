import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { AGENT_LABELS } from '../agent-detect.js';
import { commandbarCSS, commandbarHTML, commandbarScript } from '../commandbar.js';
import type { CommandbarSession } from '../commandbar.js';
import { notesDrawerCSS, notesDrawerHTML, notesDrawerScript } from '../notes-drawer.js';
import {
	sharedLayoutCSS,
	sharedHeader,
	sharedSidebar,
	newSessionModalHTML,
	newSessionModalScript,
} from '../shared-layout.js';

export function renderAgentsIndex(
	theme: TmuxWebTheme,
	commandbarEnabled = false,
	commandbarSessions: CommandbarSession[] = [],
): string {
	const labels = JSON.stringify(AGENT_LABELS).replace(/</g, '\\u003c');

	const pageSpecificCSS = `
  .sub { font-size: 11px; color: var(--panel-muted); margin-bottom: 24px; line-height: 1.5; }
  .agent {
    display: flex; align-items: center; gap: 12px; text-decoration: none;
    padding: 12px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 8px; background: var(--panel-bg); transition: border-color 0.15s;
  }
  .agent:hover { border-color: var(--panel-accent); }
  .agent .name { font-size: 13px; font-weight: 600; color: var(--page-fg); flex: 1; }
  .agent .loc { font-size: 11px; color: var(--panel-muted); }
  .badge {
    font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase;
    padding: 3px 9px; border-radius: 10px; border: 1px solid var(--panel-border);
    flex-shrink: 0; min-width: 64px; text-align: center;
  }
  .badge.working { color: var(--panel-success); border-color: var(--panel-success); }
  .badge.blocked { color: #f0c674; border-color: #f0c674; }
  .badge.idle { color: var(--panel-muted); }
  .badge.unknown { color: var(--panel-muted); opacity: 0.7; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--panel-muted); }
  .dot.working { background: var(--panel-success); }
  .dot.blocked { background: #f0c674; }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${notesDrawerCSS()}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Agents — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'Agents' })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'agents', agentsEnabled: true, refreshHref: '/agents' })}
    <main class="main-panel">
      <p class="sub">AI agents in the last panes you viewed. Updates automatically.</p>
      <div id="agents-list">
        <p class="empty" id="empty-msg">Loading…</p>
      </div>
    </main>
  </div>
</div>

${newSessionModalHTML()}
${commandbarEnabled ? commandbarHTML() : ''}
${notesDrawerHTML('Notes — Global')}

<script type="module">
${notesDrawerScript('__global__')}
${commandbarEnabled ? commandbarScript(commandbarSessions, []) : ''}
${newSessionModalScript()}
</script>

<script type="module">
const LABELS = ${labels};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(list) {
  const container = document.getElementById('agents-list');
  if (!list || list.length === 0) {
    container.innerHTML = '<p class="empty" id="empty-msg">No agents detected.<br>Open a session running Claude, Codex, OpenCode, or Cursor to start watching it.</p>';
    return;
  }
  container.innerHTML = list.map((a) => {
    const label = LABELS[a.agent] || a.agent;
    const state = a.state || 'unknown';
    return '<a class="agent" href="/s/' + encodeURIComponent(a.sessionName) + '">' +
      '<span class="dot ' + esc(state) + '"></span>' +
      '<span class="name">' + esc(label) + '</span>' +
      '<span class="loc">' + esc(a.sessionName) + ':' + a.windowIndex + '.' + a.paneIndex + '</span>' +
      '<span class="badge ' + esc(state) + '">' + esc(state) + '</span>' +
    '</a>';
  }).join('');
}

async function poll() {
  try {
    const res = await fetch('/api/agents', { headers: { 'accept': 'application/json' } });
    if (res.ok) render(await res.json());
  } catch {
    // transient — keep last render
  }
}

poll();
setInterval(poll, 2500);
</script>
</body>
</html>`;
}
