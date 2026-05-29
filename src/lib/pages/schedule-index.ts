import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';

export interface ScheduleTaskView {
	id: string;
	sessionName: string;
	windowIndex: number;
	text: string;
	fireAt: number;
	createdAt: number;
	remainingMs: number;
}

export interface TriggeredTaskView {
	id: string;
	sessionName: string;
	windowIndex: number;
	text: string;
	fireAt: number;
	createdAt: number;
	triggeredAt: number;
	status: 'ok' | 'error' | 'missed';
	error?: string;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatFireAt(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderTriggeredPanel(triggered: TriggeredTaskView[], retentionDays: number): string {
	if (!triggered.length) {
		return `<p class="empty">No tasks triggered in the last ${retentionDays} day${retentionDays === 1 ? '' : 's'}.</p>`;
	}
	const rows = triggered.map((t) => `<div class="task">
  <div class="task-row1">
    <span class="cmd">${escapeHtml(t.text)}</span>
    <span class="status-pill status-${t.status}">${t.status}</span>
  </div>
  <div class="task-row2">
    <a class="trig-target" href="/s/${encodeURIComponent(t.sessionName)}?window=${t.windowIndex}">${escapeHtml(t.sessionName)} &middot; win:${t.windowIndex}</a>
    <span class="meta">${escapeHtml(formatFireAt(t.triggeredAt))}</span>
  </div>${t.status === 'error' && t.error ? `\n  <div class="trig-error">${escapeHtml(t.error)}</div>` : ''}
</div>`).join('\n');
	return `<div class="task-list">${rows}</div>`;
}

export function renderScheduleIndex(
	tasks: ScheduleTaskView[],
	triggered: TriggeredTaskView[],
	theme: TmuxWebTheme,
	retentionDays = 7,
): string {
	const sorted = [...tasks].sort((a, b) => a.fireAt - b.fireAt);

	// Group by session, preserving earliest-fire order between groups.
	const groups = new Map<string, ScheduleTaskView[]>();
	for (const t of sorted) {
		const arr = groups.get(t.sessionName);
		if (arr) arr.push(t);
		else groups.set(t.sessionName, [t]);
	}

	const sections = [...groups.entries()].map(([session, items]) => {
		const rows = items.map((t) => `<div class="task" data-id="${escapeHtml(t.id)}">
  <div class="task-row1">
    <span class="cmd">${escapeHtml(t.text)}</span>
    <span class="countdown" data-fire-at="${t.fireAt}">…</span>
  </div>
  <div class="task-row2">
    <span class="meta">win:${t.windowIndex} &middot; fires ${escapeHtml(formatFireAt(t.fireAt))}</span>
    <button class="cancel-btn" data-id="${escapeHtml(t.id)}">cancel</button>
  </div>
</div>`).join('\n');
		return `<div class="session-group" data-session="${escapeHtml(session)}">
  <a class="session-head" href="/s/${encodeURIComponent(session)}?tab=scheduler">
    <span class="sname">${escapeHtml(session)}</span>
    <span class="scount">${items.length}</span>
  </a>
  <div class="task-list">${rows}</div>
</div>`;
	}).join('\n');

	const upcomingBody = sorted.length ? sections : '<p class="empty" id="empty-msg">No scheduled tasks.</p>';
	const triggeredBody = renderTriggeredPanel(triggered, retentionDays);

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Scheduled tasks — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace; }
  .container { max-width: 640px; margin: 60px auto; padding: 0 20px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
  h1 { font-size: 18px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--panel-accent); }
  .back-link {
    font-size: 12px; color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 6px 14px; border-radius: 6px; transition: all 0.15s;
  }
  .back-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .session-group { margin-bottom: 18px; }
  .session-head {
    display: flex; align-items: center; gap: 8px; text-decoration: none;
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); margin-bottom: 8px;
  }
  .session-head:hover .sname { text-decoration: underline; }
  .session-head .scount {
    font-size: 10px; color: var(--panel-success); border: 1px solid var(--panel-border);
    border-radius: 10px; padding: 1px 7px; text-transform: none; letter-spacing: 0;
  }
  .task {
    padding: 12px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 8px; background: var(--panel-bg);
    display: flex; flex-direction: column; gap: 6px;
  }
  .task-row1 { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .task .cmd {
    font-size: 13px; color: var(--page-fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .task .countdown {
    font-size: 13px; font-weight: 600; color: var(--panel-success);
    flex-shrink: 0; min-width: 56px; text-align: right;
  }
  .task .countdown.urgent { color: #f0c674; }
  .task .countdown.imminent { color: #cc6666; }
  .task-row2 { display: flex; justify-content: space-between; align-items: center; }
  .task .meta { font-size: 11px; color: var(--panel-muted); }
  .cancel-btn {
    font-size: 10px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 2px 10px; border-radius: 4px;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
  }
  .cancel-btn:hover { border-color: #cc6666; color: #cc6666; }
  .tab-bar { display: flex; gap: 4px; border-bottom: 1px solid var(--panel-border); margin-bottom: 20px; }
  .tab {
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--panel-muted); background: none; border: none; cursor: pointer;
    padding: 8px 14px; font-family: inherit; border-bottom: 2px solid transparent;
    margin-bottom: -1px; transition: color 0.15s, border-color 0.15s;
  }
  .tab:hover { color: var(--panel-accent); }
  .tab.active { color: var(--panel-accent); border-bottom-color: var(--panel-accent); }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .status-pill {
    font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    border: 1px solid var(--panel-border); border-radius: 10px; padding: 1px 9px; flex-shrink: 0;
  }
  .status-pill.status-ok { color: var(--panel-success); border-color: var(--panel-success); }
  .status-pill.status-error { color: #cc6666; border-color: #cc6666; }
  .status-pill.status-missed { color: var(--panel-muted); }
  .trig-target { font-size: 11px; color: var(--panel-accent); text-decoration: none; }
  .trig-target:hover { text-decoration: underline; }
  .trig-error {
    font-size: 11px; color: #cc6666; white-space: pre-wrap; word-break: break-word;
    margin-top: 2px; padding-top: 6px; border-top: 1px solid var(--panel-border);
  }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  .footer-links { margin-top: 24px; display: flex; gap: 10px; }
  .footer-link {
    display: inline-block; font-size: 12px; color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 6px 14px; border-radius: 6px; transition: all 0.15s;
  }
  .footer-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
</style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <h1>Scheduled tasks</h1>
    <a href="/" class="back-link">Back</a>
  </div>
  <div class="tab-bar">
    <button class="tab active" data-tab="upcoming">Upcoming</button>
    <button class="tab" data-tab="triggered">Recently Triggered</button>
  </div>
  <div class="tab-panel active" data-panel="upcoming">
    <div id="schedule-list">${upcomingBody}</div>
  </div>
  <div class="tab-panel" data-panel="triggered">
    ${triggeredBody}
  </div>
  <div class="footer-links">
    <a href="/schedule" class="footer-link">refresh</a>
    <a href="/notes" class="footer-link">View all notes</a>
  </div>
</div>
<script type="module">
// ── Tabs ─────────────────────────────────────────────────────────────────
function activateTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    const name = t.dataset.tab;
    activateTab(name);
    const url = new URL(location.href);
    if (name === 'upcoming') url.searchParams.delete('tab');
    else url.searchParams.set('tab', name);
    history.replaceState({}, '', url);
  });
});
if (new URLSearchParams(location.search).get('tab') === 'triggered') activateTab('triggered');

function formatCountdown(ms) {
  if (ms <= 0) return 'FIRING';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function tick() {
  document.querySelectorAll('.countdown').forEach((el) => {
    const fireAt = parseInt(el.dataset.fireAt, 10);
    const remaining = fireAt - Date.now();
    el.textContent = formatCountdown(remaining);
    el.classList.remove('urgent', 'imminent');
    if (remaining <= 10000) el.classList.add('imminent');
    else if (remaining <= 60000) el.classList.add('urgent');
  });
}

function refreshEmptyState() {
  // Drop session groups that have no remaining tasks, then show the empty
  // message if nothing is left.
  document.querySelectorAll('.session-group').forEach((g) => {
    if (!g.querySelector('.task')) g.remove();
  });
  const list = document.getElementById('schedule-list');
  if (!list.querySelector('.task') && !document.getElementById('empty-msg')) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.id = 'empty-msg';
    p.textContent = 'No scheduled tasks.';
    list.appendChild(p);
  }
}

document.getElementById('schedule-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.cancel-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  btn.disabled = true;
  try {
    const res = await fetch('/api/schedule/' + id, { method: 'DELETE' });
    if (res.ok) {
      const task = document.querySelector('.task[data-id="' + id + '"]');
      if (task) task.remove();
      refreshEmptyState();
    } else {
      btn.disabled = false;
    }
  } catch {
    btn.disabled = false;
  }
});

tick();
setInterval(tick, 1000);
</script>
</body>
</html>`;
}
