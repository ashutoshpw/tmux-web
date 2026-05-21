import { closeOtherDrawersExcept, wrapDrawerScript } from './drawer-script.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from './drawer-resize.js';
import { escapeHtml } from './html.js';

export function schedulerDrawerCSS(): string {
	return `
  #sched-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #sched-backdrop.open { opacity: 1; pointer-events: auto; }
  #sched-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 400px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  #sched-drawer.open { transform: translateX(0); }
  ${drawerResizeCSS()}
  header .sched-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  header .sched-btn:hover { color: var(--panel-accent); }
  header .sched-btn svg { width: 15px; height: 15px; fill: currentColor; }
  .sched-form-section {
    padding: 14px 16px; border-bottom: 1px solid var(--panel-border); flex-shrink: 0;
    display: flex; flex-direction: column; gap: 10px;
  }
  .sched-field-row { display: flex; gap: 8px; align-items: center; }
  .sched-field-row label {
    font-size: 10px; color: var(--panel-muted); text-transform: uppercase;
    letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace;
    width: 56px; flex-shrink: 0;
  }
  .sched-input {
    flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border);
    color: var(--page-fg); font-family: 'JetBrains Mono', monospace; font-size: 12px;
    padding: 5px 9px; border-radius: 6px; outline: none; transition: border-color 0.15s;
  }
  .sched-input:focus { border-color: rgba(125, 211, 252, 0.4); }
  .sched-input.error { border-color: #cc6666; }
  select.sched-input { cursor: pointer; }
  .sched-presets { display: flex; gap: 6px; padding-left: 64px; }
  .sched-preset-btn {
    font-size: 11px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 4px 10px; border-radius: 6px;
    cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  .sched-preset-btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .sched-bottom-row {
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
  }
  .sched-error-msg {
    font-size: 11px; color: #cc6666; font-family: 'JetBrains Mono', monospace; flex: 1;
  }
  .sched-submit-btn {
    font-size: 11px; background: rgba(115, 201, 145, 0.12);
    border: 1px solid var(--panel-success); color: var(--panel-success);
    padding: 6px 18px; border-radius: 6px; cursor: pointer; flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  .sched-submit-btn:hover { background: rgba(115, 201, 145, 0.22); }
  .sched-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .sched-tasks-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .sched-tasks-header {
    padding: 8px 16px; font-size: 10px; color: var(--panel-muted);
    text-transform: uppercase; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace;
    border-bottom: 1px solid var(--panel-border); flex-shrink: 0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .sched-task-count {
    font-size: 10px; color: var(--panel-success); font-family: 'JetBrains Mono', monospace;
  }
  .sched-task-list { flex: 1; overflow-y: auto; }
  .sched-task-item {
    padding: 10px 16px; border-bottom: 1px solid rgba(36, 50, 65, 0.6);
    display: flex; flex-direction: column; gap: 4px;
  }
  .sched-task-item:last-child { border-bottom: none; }
  .sched-task-row1 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .sched-task-cmd {
    font-size: 12px; color: var(--panel-accent); font-family: 'JetBrains Mono', monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sched-countdown {
    font-size: 12px; color: var(--panel-success); font-family: 'JetBrains Mono', monospace;
    font-weight: 600; flex-shrink: 0; min-width: 48px; text-align: right;
  }
  .sched-countdown.urgent { color: #f0c674; }
  .sched-countdown.imminent { color: #cc6666; }
  .sched-task-row2 { display: flex; justify-content: space-between; align-items: center; }
  .sched-task-meta {
    font-size: 10px; color: var(--panel-muted); font-family: 'JetBrains Mono', monospace;
  }
  .sched-cancel-btn {
    font-size: 10px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 2px 8px; border-radius: 4px;
    cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  .sched-cancel-btn:hover { border-color: #cc6666; color: #cc6666; }
  .sched-empty {
    padding: 32px 16px; text-align: center; font-size: 12px;
    color: var(--panel-muted); font-family: 'JetBrains Mono', monospace;
  }`;
}

export function schedulerDrawerHTML(title: string): string {
	return `
<div id="sched-backdrop"></div>
<div id="sched-drawer" class="resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${escapeHtml(title)}</span>
    <button id="sched-close">&times;</button>
  </div>
  <div class="sched-form-section">
    <div class="sched-field-row">
      <label>Window</label>
      <select id="sched-window" class="sched-input"></select>
    </div>
    <div class="sched-field-row">
      <label>Command</label>
      <input id="sched-cmd" class="sched-input" type="text"
             placeholder="e.g. npm run build" autocomplete="off" spellcheck="false" />
    </div>
    <div class="sched-field-row">
      <label>Delay</label>
      <input id="sched-delay" class="sched-input" type="text"
             placeholder="1h, 5m, 30s, 1m30s" autocomplete="off" />
    </div>
    <div class="sched-presets">
      <button class="sched-preset-btn" data-delay="1m">1m</button>
      <button class="sched-preset-btn" data-delay="5m">5m</button>
      <button class="sched-preset-btn" data-delay="15m">15m</button>
      <button class="sched-preset-btn" data-delay="1h">1h</button>
    </div>
    <div class="sched-bottom-row">
      <div class="sched-error-msg" id="sched-error"></div>
      <button class="sched-submit-btn" id="sched-submit">Schedule</button>
    </div>
  </div>
  <div class="sched-tasks-section">
    <div class="sched-tasks-header">
      <span>Pending Tasks</span>
      <span class="sched-task-count" id="sched-task-count"></span>
    </div>
    <div class="sched-task-list" id="sched-task-list"></div>
  </div>
</div>`;
}

export function schedulerDrawerScript(session: string): string {
	const sessionJs = JSON.stringify(session);
	return wrapDrawerScript('scheduler', `
const SCHED_SESSION = ${sessionJs};
${drawerResizeScript('sched-drawer', 'tmux-web:drawer-width:scheduler', 400)}

let schedCountdownInterval = null;
let schedTickCount = 0;

function parseDelay(str) {
  str = (str || '').trim().toLowerCase();
  if (!str) return null;
  const m = str.match(/^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const ms = ((parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')) * 1000;
  return ms > 0 ? ms : null;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'FIRING';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function updateCountdownEl(el) {
  const fireAt = parseInt(el.dataset.fireAt, 10);
  const remaining = fireAt - Date.now();
  el.textContent = formatCountdown(remaining);
  el.className = 'sched-countdown';
  if (remaining <= 10000) el.classList.add('imminent');
  else if (remaining <= 60000) el.classList.add('urgent');
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function fetchSchedWindows() {
  try {
    const res = await fetch('/api/session/' + encodeURIComponent(SCHED_SESSION) + '/windows');
    if (!res.ok) return;
    const windows = await res.json();
    const sel = document.getElementById('sched-window');
    clearChildren(sel);
    windows.forEach(w => {
      const opt = document.createElement('option');
      opt.value = String(w.index);
      opt.textContent = w.index + ': ' + w.name + (w.active ? ' (active)' : '');
      if (w.active) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch {}
}

function renderTaskList(tasks) {
  const list = document.getElementById('sched-task-list');
  const countEl = document.getElementById('sched-task-count');
  countEl.textContent = tasks.length ? String(tasks.length) : '';
  clearChildren(list);
  if (!tasks.length) {
    list.appendChild(el('div', 'sched-empty', 'No pending tasks'));
    return;
  }
  for (const task of tasks) {
    const item = el('div', 'sched-task-item');

    const row1 = el('div', 'sched-task-row1');
    const cmd = el('div', 'sched-task-cmd', task.text);
    const countdown = el('div', 'sched-countdown');
    countdown.dataset.fireAt = String(task.fireAt);
    updateCountdownEl(countdown);
    row1.appendChild(cmd);
    row1.appendChild(countdown);

    const row2 = el('div', 'sched-task-row2');
    const meta = el('div', 'sched-task-meta', 'win:' + task.windowIndex);
    const cancelBtn = el('button', 'sched-cancel-btn', 'cancel');
    cancelBtn.addEventListener('click', () => cancelTask(task.id));
    row2.appendChild(meta);
    row2.appendChild(cancelBtn);

    item.appendChild(row1);
    item.appendChild(row2);
    list.appendChild(item);
  }
}

async function fetchTasks() {
  try {
    const res = await fetch('/api/schedule?session=' + encodeURIComponent(SCHED_SESSION));
    if (!res.ok) return;
    renderTaskList(await res.json());
  } catch {}
}

async function cancelTask(id) {
  try {
    await fetch('/api/schedule/' + id, { method: 'DELETE' });
    fetchTasks();
  } catch {}
}

async function scheduleTask() {
  const cmdEl = document.getElementById('sched-cmd');
  const delayEl = document.getElementById('sched-delay');
  const winEl = document.getElementById('sched-window');
  const errorEl = document.getElementById('sched-error');
  const submitBtn = document.getElementById('sched-submit');

  errorEl.textContent = '';
  cmdEl.classList.remove('error');
  delayEl.classList.remove('error');

  const cmd = cmdEl.value.trim();
  if (!cmd) {
    cmdEl.classList.add('error');
    errorEl.textContent = 'Command is required.';
    return;
  }
  const delayMs = parseDelay(delayEl.value);
  if (!delayMs) {
    delayEl.classList.add('error');
    errorEl.textContent = 'Use: 1h, 5m, 30s, 1m30s';
    return;
  }
  const windowIndex = parseInt(winEl.value, 10);

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName: SCHED_SESSION, windowIndex, text: cmd, delayMs }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errorEl.textContent = err.error || 'Server error.';
      return;
    }
    cmdEl.value = '';
    delayEl.value = '';
    fetchTasks();
  } catch {
    errorEl.textContent = 'Network error.';
  } finally {
    submitBtn.disabled = false;
  }
}

function startSchedTick() {
  if (schedCountdownInterval) return;
  schedTickCount = 0;
  schedCountdownInterval = setInterval(() => {
    document.querySelectorAll('.sched-countdown').forEach(updateCountdownEl);
    schedTickCount++;
    if (schedTickCount % 10 === 0) fetchTasks();
  }, 1000);
}

function stopSchedTick() {
  if (schedCountdownInterval) { clearInterval(schedCountdownInterval); schedCountdownInterval = null; }
}

function openSchedDrawer() {
  ${closeOtherDrawersExcept('scheduler')}
  document.getElementById('sched-drawer').classList.add('open');
  document.getElementById('sched-backdrop').classList.add('open');
  fetchSchedWindows();
  fetchTasks();
  startSchedTick();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'scheduler') {
    url.searchParams.set('tab', 'scheduler');
    history.pushState({ schedOpen: true }, '', url);
  }
}

function closeSchedDrawer() {
  document.getElementById('sched-drawer').classList.remove('open');
  document.getElementById('sched-backdrop').classList.remove('open');
  stopSchedTick();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'scheduler') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

document.getElementById('sched-toggle').addEventListener('click', () => {
  if (document.getElementById('sched-drawer').classList.contains('open')) closeSchedDrawer();
  else openSchedDrawer();
});
document.getElementById('sched-close').addEventListener('click', closeSchedDrawer);
document.getElementById('sched-backdrop').addEventListener('click', closeSchedDrawer);
document.getElementById('sched-submit').addEventListener('click', scheduleTask);
document.getElementById('sched-cmd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') scheduleTask();
});
document.querySelectorAll('.sched-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('sched-delay').value = btn.dataset.delay;
    document.getElementById('sched-cmd').focus();
  });
});

window.addEventListener('popstate', () => {
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab === 'scheduler') openSchedDrawer();
  else closeSchedDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'scheduler') openSchedDrawer();`, 'closeSchedDrawer');
}
