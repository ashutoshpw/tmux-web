import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
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
	commandbarEnabled = false,
	commandbarSessions: CommandbarSession[] = [],
	agentsEnabled = false,
): string {
	const sorted = [...tasks].sort((a, b) => a.fireAt - b.fireAt);

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
    <span class="meta"><a class="win-link" href="/s/${encodeURIComponent(t.sessionName)}?window=${t.windowIndex}">win:${t.windowIndex}</a> &middot; fires ${escapeHtml(formatFireAt(t.fireAt))}</span>
    <div style="display:flex;gap:4px;align-items:center;">
      <button class="reschedule-btn" data-id="${escapeHtml(t.id)}">reschedule</button>
      <button class="cancel-btn" data-id="${escapeHtml(t.id)}">cancel</button>
    </div>
  </div>
  <div class="reschedule-row" data-id="${escapeHtml(t.id)}">
    <div class="reschedule-presets">
      <button class="reschedule-preset-btn" data-delay="1m">1m</button>
      <button class="reschedule-preset-btn" data-delay="5m">5m</button>
      <button class="reschedule-preset-btn" data-delay="15m">15m</button>
      <button class="reschedule-preset-btn" data-delay="1h">1h</button>
    </div>
    <div class="reschedule-input-row">
      <input class="reschedule-input" type="text" placeholder="1h, 5m, 30s, 1m30s" autocomplete="off" />
      <button class="reschedule-confirm-btn">Set</button>
      <span class="reschedule-error"></span>
    </div>
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

	const pageSpecificCSS = `
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
  .win-link { color: var(--panel-accent); text-decoration: none; }
  .win-link:hover { text-decoration: underline; }
  .cancel-btn {
    font-size: 10px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 2px 10px; border-radius: 4px;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
  }
  .cancel-btn:hover { border-color: #cc6666; color: #cc6666; }
  .reschedule-btn {
    font-size: 10px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 2px 10px; border-radius: 4px;
    cursor: pointer; font-family: inherit; transition: all 0.15s; margin-right: 4px;
  }
  .reschedule-btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .reschedule-row {
    display: none; flex-direction: column; gap: 6px;
    padding-top: 8px; border-top: 1px solid var(--panel-border);
  }
  .reschedule-row.active { display: flex; }
  .reschedule-presets { display: flex; gap: 6px; }
  .reschedule-preset-btn {
    font-size: 11px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 3px 10px; border-radius: 6px;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
  }
  .reschedule-preset-btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .reschedule-input-row { display: flex; gap: 8px; align-items: center; }
  .reschedule-input {
    flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border);
    color: var(--page-fg); font-family: inherit; font-size: 12px;
    padding: 4px 8px; border-radius: 6px; outline: none; transition: border-color 0.15s;
  }
  .reschedule-input:focus { border-color: rgba(125,211,252,0.4); }
  .reschedule-input.error { border-color: #cc6666; }
  .reschedule-confirm-btn {
    font-size: 11px; background: rgba(115,201,145,0.12);
    border: 1px solid var(--panel-success); color: var(--panel-success);
    padding: 4px 14px; border-radius: 6px; cursor: pointer; font-family: inherit;
  }
  .reschedule-confirm-btn:hover { background: rgba(115,201,145,0.22); }
  .reschedule-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .reschedule-error { font-size: 11px; color: #cc6666; }
  .page-tab-bar { display: flex; gap: 4px; border-bottom: 1px solid var(--panel-border); margin-bottom: 20px; }
  .page-tab {
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--panel-muted); background: none; border: none; cursor: pointer;
    padding: 8px 14px; font-family: inherit; border-bottom: 2px solid transparent;
    margin-bottom: -1px; transition: color 0.15s, border-color 0.15s;
  }
  .page-tab:hover { color: var(--panel-accent); }
  .page-tab.active { color: var(--panel-accent); border-bottom-color: var(--panel-accent); }
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
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${notesDrawerCSS()}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Scheduled tasks — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'Scheduled' })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'schedule', agentsEnabled, refreshHref: '/schedule' })}
    <main class="main-panel">
      <div class="page-tab-bar">
        <button class="page-tab active" data-tab="upcoming">Upcoming</button>
        <button class="page-tab" data-tab="triggered">Recently Triggered</button>
      </div>
      <div class="tab-panel active" data-panel="upcoming">
        <div id="schedule-list">${upcomingBody}</div>
      </div>
      <div class="tab-panel" data-panel="triggered">
        ${triggeredBody}
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

<script>
// ── Tabs ─────────────────────────────────────────────────────────────────
function activateTab(name) {
  document.querySelectorAll('.page-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}
document.querySelectorAll('.page-tab').forEach((t) => {
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

function parseDelay(str) {
  str = (str || '').trim().toLowerCase();
  if (!str) return null;
  const m = str.match(/^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const ms = ((parseInt(m[1]||'0')*3600)+(parseInt(m[2]||'0')*60)+parseInt(m[3]||'0'))*1000;
  return ms > 0 ? ms : null;
}

function openReschedule(id) {
  document.querySelectorAll('.reschedule-row.active').forEach((r) => {
    if (r.dataset.id !== id) closeReschedule(r.dataset.id);
  });
  const row = document.querySelector('.reschedule-row[data-id="' + id + '"]');
  if (!row) return;
  row.classList.add('active');
  const input = row.querySelector('.reschedule-input');
  input.value = ''; input.classList.remove('error');
  row.querySelector('.reschedule-error').textContent = '';
  input.focus();
}

function closeReschedule(id) {
  const row = document.querySelector('.reschedule-row[data-id="' + id + '"]');
  if (!row) return;
  row.classList.remove('active');
  const input = row.querySelector('.reschedule-input');
  input.value = ''; input.classList.remove('error');
  row.querySelector('.reschedule-error').textContent = '';
}

async function submitReschedule(id, delayStr) {
  const row = document.querySelector('.reschedule-row[data-id="' + id + '"]');
  if (!row) return;
  const input = row.querySelector('.reschedule-input');
  const errorEl = row.querySelector('.reschedule-error');
  const confirmBtn = row.querySelector('.reschedule-confirm-btn');
  const delayMs = parseDelay(delayStr !== undefined ? delayStr : input.value);
  if (!delayMs) {
    input.classList.add('error');
    errorEl.textContent = 'Use: 1h, 5m, 30s, 1m30s';
    input.focus();
    return;
  }
  input.classList.remove('error'); errorEl.textContent = '';
  confirmBtn.disabled = true;
  try {
    const res = await fetch('/api/schedule/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delayMs }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errorEl.textContent = err.error || 'Server error.';
      confirmBtn.disabled = false;
      return;
    }
    const data = await res.json();
    const task = document.querySelector('.task[data-id="' + id + '"]');
    if (task) {
      const countdown = task.querySelector('.countdown');
      if (countdown) countdown.dataset.fireAt = String(data.fireAt);
      const meta = task.querySelector('.meta');
      if (meta) {
        const d = new Date(data.fireAt);
        const win = (meta.textContent.match(/win:(\d+)/) || ['','?'])[1];
        const time = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        meta.textContent = 'win:' + win + ' · fires ' + time;
      }
    }
    closeReschedule(id);
  } catch {
    errorEl.textContent = 'Network error.';
    confirmBtn.disabled = false;
  }
}

document.getElementById('schedule-list').addEventListener('click', async (e) => {
  const cancelBtn = e.target.closest('.cancel-btn');
  if (cancelBtn) {
    const id = cancelBtn.dataset.id;
    cancelBtn.disabled = true;
    try {
      const res = await fetch('/api/schedule/' + id, { method: 'DELETE' });
      if (res.ok) {
        const task = document.querySelector('.task[data-id="' + id + '"]');
        if (task) task.remove();
        refreshEmptyState();
      } else { cancelBtn.disabled = false; }
    } catch { cancelBtn.disabled = false; }
    return;
  }

  const rescheduleBtn = e.target.closest('.reschedule-btn');
  if (rescheduleBtn) {
    const id = rescheduleBtn.dataset.id;
    const row = document.querySelector('.reschedule-row[data-id="' + id + '"]');
    if (row && row.classList.contains('active')) closeReschedule(id);
    else openReschedule(id);
    return;
  }

  const confirmBtn = e.target.closest('.reschedule-confirm-btn');
  if (confirmBtn) {
    const row = confirmBtn.closest('.reschedule-row');
    if (row) await submitReschedule(row.dataset.id);
    return;
  }

  const presetBtn = e.target.closest('.reschedule-preset-btn');
  if (presetBtn) {
    const row = presetBtn.closest('.reschedule-row');
    if (row) await submitReschedule(row.dataset.id, presetBtn.dataset.delay);
    return;
  }
});

document.getElementById('schedule-list').addEventListener('keydown', (e) => {
  const input = e.target.closest('.reschedule-input');
  if (!input) return;
  const row = input.closest('.reschedule-row');
  if (!row) return;
  if (e.key === 'Escape') { e.preventDefault(); closeReschedule(row.dataset.id); }
  else if (e.key === 'Enter') { e.preventDefault(); void submitReschedule(row.dataset.id); }
});

document.getElementById('schedule-list').addEventListener('focusout', (e) => {
  const row = e.target.closest('.reschedule-row');
  if (!row || row.contains(e.relatedTarget)) return;
  closeReschedule(row.dataset.id);
});

tick();
setInterval(tick, 1000);
</script>
</body>
</html>`;
}
