import { closeOtherDrawersExcept, wrapDrawerScript } from './drawer-script.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScriptLeft } from './drawer-resize.js';

export function sessionsDrawerCSS(): string {
	return `
  #sessions-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #sessions-backdrop.open { opacity: 1; pointer-events: auto; }
  #sessions-drawer {
    position: fixed; left: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-right: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(-100%); transition: transform 0.25s ease;
  }
  #sessions-drawer.open { transform: translateX(0); }
  #sessions-drawer .drawer-resize-handle {
    left: auto; right: -5px;
  }
  ${drawerResizeCSS()}
  header .sessions-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  header .sessions-btn:hover { color: var(--panel-accent); }
  header .sessions-btn svg { width: 15px; height: 15px; fill: currentColor; }
  #sessions-drawer .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
  }
  #sessions-drawer .drawer-header button {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  #sessions-drawer .drawer-header button:hover { color: var(--panel-accent); }
  #sessions-toolbar {
    display: flex; align-items: center; justify-content: flex-end;
    padding: 8px 16px; border-bottom: 1px solid var(--panel-border); flex-shrink: 0;
  }
  #sessions-pin-window {
    font-size: 11px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 4px 10px; border-radius: 6px;
    cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  #sessions-pin-window:hover:not(:disabled) {
    border-color: var(--panel-accent); color: var(--panel-accent);
  }
  #sessions-pin-window:disabled { opacity: 0.4; cursor: not-allowed; }
  #sessions-error {
    padding: 8px 16px; font-size: 11px; color: #cc6666;
    font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
    border-bottom: 1px solid var(--panel-border);
    display: none;
  }
  #sessions-error.show { display: block; }
  #sessions-list {
    flex: 1; overflow-y: auto; padding: 8px 0;
  }
  .sessions-section-label {
    padding: 8px 16px 4px; font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--panel-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .sessions-row {
    display: flex; align-items: center; gap: 8px;
    width: 100%; min-height: 44px; padding: 10px 12px 10px 16px;
    background: none; border: none; border-bottom: 1px solid rgba(36, 50, 65, 0.5);
    color: var(--page-fg); cursor: pointer; text-align: left;
    font-family: 'JetBrains Mono', monospace; transition: background 0.15s;
  }
  .sessions-row:last-child { border-bottom: none; }
  .sessions-row:hover { background: rgba(125, 211, 252, 0.06); }
  .sessions-row.current { background: rgba(125, 211, 252, 0.08); }
  .sessions-row.missing { opacity: 0.65; }
  .sessions-row-main {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  }
  .sessions-row-name {
    font-size: 13px; color: var(--panel-accent); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .sessions-row-meta {
    font-size: 10px; color: var(--panel-muted); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .sessions-pin-btn {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    color: var(--panel-muted); font-size: 14px; line-height: 1; padding: 4px;
    border-radius: 4px; transition: color 0.15s;
  }
  .sessions-pin-btn:hover { color: var(--panel-accent); }
  .sessions-pin-btn.pinned { color: #fbbf24; }
  .sessions-empty {
    padding: 16px; text-align: center; color: var(--panel-muted);
    font-size: 12px; font-family: 'JetBrains Mono', monospace;
  }
  @media (max-width: 560px) {
    #sessions-drawer { width: min(100vw - 16px, 400px); }
    .sessions-row { min-height: 48px; padding: 12px 12px 12px 16px; }
    .sessions-row-name { font-size: 14px; }
  }`;
}

export function sessionsDrawerButtonHTML(): string {
	return `<button class="sessions-btn" id="sessions-toggle" title="Recent sessions" aria-label="Recent sessions">
    <svg viewBox="0 0 24 24"><path d="M3 5h18v2H3V5zm0 6h12v2H3v-2zm0 6h18v2H3v-2z"/></svg>
  </button>`;
}

export function sessionsDrawerHTML(): string {
	return `
<div id="sessions-backdrop"></div>
<div id="sessions-drawer" class="resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>Sessions</span>
    <button id="sessions-close">&times;</button>
  </div>
  <div id="sessions-toolbar">
    <button type="button" id="sessions-pin-window">Pin current window</button>
  </div>
  <div id="sessions-error"></div>
  <div id="sessions-list"></div>
</div>`;
}

export function sessionsDrawerScript(sessionName: string): string {
	return wrapDrawerScript('sessions', `
${drawerResizeScriptLeft('sessions-drawer', 'tmux-web:drawer-width:sessions', 360)}
const SIDEBAR_SESSION = ${JSON.stringify(sessionName)};
const sessionsDrawer = document.getElementById('sessions-drawer');
const sessionsBackdrop = document.getElementById('sessions-backdrop');
const sessionsList = document.getElementById('sessions-list');
const sessionsError = document.getElementById('sessions-error');
const pinWindowBtn = document.getElementById('sessions-pin-window');
let sidebarData = { pinned: [], recent: [], currentSession: SIDEBAR_SESSION };
let activeWindowIndex = null;

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeTime(ts) {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  if (diffMs < 45000) return 'just now';
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  if (hours < 24) return formatter.format(-hours, 'hour');
  if (days < 7) return formatter.format(-days, 'day');
  if (weeks < 5) return formatter.format(-weeks, 'week');
  if (months < 12) return formatter.format(-months, 'month');
  return formatter.format(-Math.floor(days / 365), 'year');
}

function showSessionsError(msg) {
  sessionsError.textContent = msg;
  sessionsError.classList.add('show');
}

function clearSessionsError() {
  sessionsError.textContent = '';
  sessionsError.classList.remove('show');
}

function clearSessionsList(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function sessionMeta(session) {
  const parts = [
    session.windows + ' window' + (session.windows === 1 ? '' : 's'),
  ];
  if (session.attached) parts.push('attached');
  const recent = relativeTime(session.lastAccessedAt);
  if (recent) parts.push(recent);
  return parts.join(' · ');
}

function pinnedLabel(view) {
  if (view.windowIndex !== undefined) {
    const suffix = view.windowName ? ' · ' + view.windowName : '';
    return view.sessionName + ' · win ' + view.windowIndex + suffix;
  }
  return view.sessionName;
}

function pinnedMeta(view) {
  if (view.missing) return 'missing';
  const parts = [];
  if (view.windows !== undefined) {
    parts.push(view.windows + ' window' + (view.windows === 1 ? '' : 's'));
  }
  if (view.attached) parts.push('attached');
  return parts.join(' · ') || 'pinned';
}

function viewHref(view) {
  if (view.windowIndex !== undefined) {
    return '/s/' + encodeURIComponent(view.sessionName) + '?window=' + view.windowIndex;
  }
  return '/s/' + encodeURIComponent(view.sessionName);
}

function isCurrentView(view) {
  if (view.sessionName !== SIDEBAR_SESSION) return false;
  if (view.windowIndex === undefined) return true;
  return activeWindowIndex === view.windowIndex;
}

function isCurrentSession(session) {
  return session.name === SIDEBAR_SESSION;
}

function createPinButton(pinned, sessionName, windowIndex) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sessions-pin-btn' + (pinned ? ' pinned' : '');
  btn.title = pinned ? 'Unpin' : 'Pin';
  btn.setAttribute('aria-label', pinned ? 'Unpin' : 'Pin');
  btn.textContent = pinned ? '★' : '☆';
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    void togglePin(sessionName, windowIndex, pinned);
  });
  return btn;
}

function createRow({ label, meta, href, current, missing, pinned, sessionName, windowIndex }) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'sessions-row'
    + (current ? ' current' : '')
    + (missing ? ' missing' : '');

  const main = document.createElement('span');
  main.className = 'sessions-row-main';

  const name = document.createElement('span');
  name.className = 'sessions-row-name';
  name.textContent = label;

  const metaEl = document.createElement('span');
  metaEl.className = 'sessions-row-meta';
  metaEl.textContent = meta;

  main.appendChild(name);
  main.appendChild(metaEl);
  row.appendChild(main);
  row.appendChild(createPinButton(pinned, sessionName, windowIndex));

  if (!missing) {
    row.addEventListener('click', () => {
      window.location.href = href;
    });
  }

  return row;
}

function renderSectionLabel(text) {
  const label = document.createElement('div');
  label.className = 'sessions-section-label';
  label.textContent = text;
  return label;
}

function renderSidebar() {
  clearSessionsList(sessionsList);

  const pinned = sidebarData.pinned || [];
  const recent = sidebarData.recent || [];

  if (!pinned.length && !recent.length) {
    sessionsList.appendChild(Object.assign(document.createElement('div'), {
      className: 'sessions-empty',
      textContent: 'No tmux sessions found',
    }));
    return;
  }

  if (pinned.length) {
    sessionsList.appendChild(renderSectionLabel('Pinned'));
    for (const view of pinned) {
      sessionsList.appendChild(createRow({
        label: pinnedLabel(view),
        meta: pinnedMeta(view),
        href: viewHref(view),
        current: isCurrentView(view),
        missing: !!view.missing,
        pinned: true,
        sessionName: view.sessionName,
        windowIndex: view.windowIndex,
      }));
    }
  }

  if (recent.length) {
    sessionsList.appendChild(renderSectionLabel('Recent'));
    for (const session of recent) {
      sessionsList.appendChild(createRow({
        label: session.name,
        meta: sessionMeta(session),
        href: '/s/' + encodeURIComponent(session.name),
        current: isCurrentSession(session),
        missing: false,
        pinned: false,
        sessionName: session.name,
        windowIndex: undefined,
      }));
    }
  }
}

async function fetchSidebarData() {
  const url = '/api/sidebar/sessions?currentSession=' + encodeURIComponent(SIDEBAR_SESSION);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load sessions');
  return await res.json();
}

async function fetchActiveWindow() {
  try {
    const res = await fetch('/api/session/' + encodeURIComponent(SIDEBAR_SESSION) + '/windows');
    if (!res.ok) return null;
    const windows = await res.json();
    const active = windows.find((window) => window.active);
    return active ? active.index : null;
  } catch {
    return null;
  }
}

function updatePinWindowButton() {
  pinWindowBtn.disabled = activeWindowIndex === null;
}

async function refreshSidebar() {
  sidebarData = await fetchSidebarData();
  activeWindowIndex = await fetchActiveWindow();
  updatePinWindowButton();
  renderSidebar();
}

async function togglePin(sessionName, windowIndex, pinned) {
  clearSessionsError();
  try {
    const res = await fetch('/api/pinned-views', {
      method: pinned ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        windowIndex === undefined
          ? { sessionName }
          : { sessionName, windowIndex },
      ),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showSessionsError(data.error || 'Failed to update pin');
      return;
    }
    sidebarData = await res.json();
    renderSidebar();
  } catch {
    showSessionsError('Failed to update pin');
  }
}

async function openSessionsDrawer() {
  ${closeOtherDrawersExcept('sessions')}
  clearSessionsError();
  sessionsDrawer.classList.add('open');
  sessionsBackdrop.classList.add('open');
  await refreshSidebar();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'sessions') {
    url.searchParams.set('tab', 'sessions');
    history.pushState({ sessionsOpen: true }, '', url);
  }
}

function closeSessionsDrawer() {
  sessionsDrawer.classList.remove('open');
  sessionsBackdrop.classList.remove('open');
  clearSessionsError();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'sessions') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

pinWindowBtn.addEventListener('click', async () => {
  if (activeWindowIndex === null) return;
  clearSessionsError();
  try {
    const res = await fetch('/api/pinned-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName: SIDEBAR_SESSION, windowIndex: activeWindowIndex }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showSessionsError(data.error || 'Failed to pin current window');
      return;
    }
    sidebarData = await res.json();
    renderSidebar();
  } catch {
    showSessionsError('Failed to pin current window');
  }
});

document.getElementById('sessions-toggle').addEventListener('click', () => {
  if (sessionsDrawer.classList.contains('open')) closeSessionsDrawer();
  else void openSessionsDrawer();
});
document.getElementById('sessions-close').addEventListener('click', closeSessionsDrawer);
sessionsBackdrop.addEventListener('click', closeSessionsDrawer);

window.addEventListener('popstate', () => {
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab === 'sessions') void openSessionsDrawer();
  else closeSessionsDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'sessions') void openSessionsDrawer();`, 'closeSessionsDrawer');
}
