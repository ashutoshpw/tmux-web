import { closeOtherDrawersExcept, wrapDrawerScript } from './drawer-script.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from './drawer-resize.js';

export function windowsDrawerCSS(): string {
	return `
  #windows-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #windows-backdrop.open { opacity: 1; pointer-events: auto; }
  #windows-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  #windows-drawer.open { transform: translateX(0); }
  ${drawerResizeCSS()}
  header .windows-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  header .windows-btn:hover { color: var(--panel-accent); }
  header .windows-btn svg { width: 15px; height: 15px; fill: currentColor; }
  #windows-error {
    padding: 8px 16px; font-size: 11px; color: #cc6666;
    font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
    border-bottom: 1px solid var(--panel-border);
    display: none;
  }
  #windows-error.show { display: block; }
  #windows-list {
    flex: 1; overflow-y: auto; padding: 8px 0;
  }
  .windows-row {
    display: flex; align-items: center; gap: 10px;
    width: 100%; min-height: 48px; padding: 12px 16px;
    background: none; border: none; border-bottom: 1px solid rgba(36, 50, 65, 0.5);
    color: var(--page-fg); cursor: pointer; text-align: left;
    font-family: 'JetBrains Mono', monospace; transition: background 0.15s;
  }
  .windows-row:last-child { border-bottom: none; }
  .windows-row:hover:not(:disabled) { background: rgba(125, 211, 252, 0.06); }
  .windows-row:disabled { cursor: default; opacity: 0.85; }
  .windows-row-index {
    font-size: 12px; color: var(--panel-muted); flex-shrink: 0; min-width: 24px;
  }
  .windows-row-name {
    flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .windows-row-badge {
    font-size: 10px; color: var(--panel-success); text-transform: uppercase;
    letter-spacing: 0.08em; flex-shrink: 0;
  }
  .windows-empty {
    padding: 24px 16px; text-align: center; color: var(--panel-muted);
    font-size: 12px; font-family: 'JetBrains Mono', monospace;
  }
  @media (max-width: 560px) {
    #windows-drawer { width: min(100vw - 16px, 400px); }
    .windows-row { min-height: 52px; padding: 14px 16px; }
    .windows-row-name { font-size: 15px; }
  }`;
}

export function windowsDrawerHTML(title: string): string {
	return `
<div id="windows-backdrop"></div>
<div id="windows-drawer" class="resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${title}</span>
    <button id="windows-close">&times;</button>
  </div>
  <div id="windows-error"></div>
  <div id="windows-list"></div>
</div>`;
}

export function windowsDrawerScript(sessionName: string): string {
	return wrapDrawerScript('windows', `
${drawerResizeScript('windows-drawer', 'tmux-web:drawer-width:windows', 360)}
const WIN_SESSION = ${JSON.stringify(sessionName)};
const windowsDrawer = document.getElementById('windows-drawer');
const windowsBackdrop = document.getElementById('windows-backdrop');
const windowsList = document.getElementById('windows-list');
const windowsError = document.getElementById('windows-error');
let windowsRefreshInterval = null;

function showWindowsError(msg) {
  windowsError.textContent = msg;
  windowsError.classList.add('show');
}

function clearWindowsError() {
  windowsError.textContent = '';
  windowsError.classList.remove('show');
}

function clearWinList(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

async function fetchWinList() {
  try {
    const res = await fetch('/api/session/' + encodeURIComponent(WIN_SESSION) + '/windows');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function renderWindowsList(windows) {
  clearWinList(windowsList);
  if (!windows.length) {
    windowsList.appendChild(Object.assign(document.createElement('div'), {
      className: 'windows-empty',
      textContent: 'No windows in this session',
    }));
    return;
  }
  for (const w of windows) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'windows-row';
    btn.disabled = w.active;

    const idx = document.createElement('span');
    idx.className = 'windows-row-index';
    idx.textContent = String(w.index);

    const name = document.createElement('span');
    name.className = 'windows-row-name';
    name.textContent = w.name;

    btn.appendChild(idx);
    btn.appendChild(name);

    if (w.active) {
      const badge = document.createElement('span');
      badge.className = 'windows-row-badge';
      badge.textContent = 'current';
      btn.appendChild(badge);
    } else {
      btn.addEventListener('click', () => selectWindow(w.index));
    }

    windowsList.appendChild(btn);
  }
}

async function selectWindow(windowIndex) {
  clearWindowsError();
  try {
    const res = await fetch(
      '/api/session/' + encodeURIComponent(WIN_SESSION) + '/select-window',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowIndex }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showWindowsError(data.error || 'Failed to switch window');
      return;
    }
    closeWindowsDrawer();
  } catch {
    showWindowsError('Failed to switch window');
  }
}

function startWindowsRefresh() {
  stopWindowsRefresh();
  windowsRefreshInterval = setInterval(async () => {
    if (!windowsDrawer.classList.contains('open')) return;
    renderWindowsList(await fetchWinList());
  }, 2500);
}

function stopWindowsRefresh() {
  if (windowsRefreshInterval) {
    clearInterval(windowsRefreshInterval);
    windowsRefreshInterval = null;
  }
}

async function openWindowsDrawer() {
  ${closeOtherDrawersExcept('windows')}
  clearWindowsError();
  windowsDrawer.classList.add('open');
  windowsBackdrop.classList.add('open');
  renderWindowsList(await fetchWinList());
  startWindowsRefresh();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'windows') {
    url.searchParams.set('tab', 'windows');
    history.pushState({ windowsOpen: true }, '', url);
  }
}

function closeWindowsDrawer() {
  windowsDrawer.classList.remove('open');
  windowsBackdrop.classList.remove('open');
  stopWindowsRefresh();
  clearWindowsError();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'windows') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

document.getElementById('windows-toggle').addEventListener('click', () => {
  if (windowsDrawer.classList.contains('open')) closeWindowsDrawer();
  else openWindowsDrawer();
});
document.getElementById('windows-close').addEventListener('click', closeWindowsDrawer);
windowsBackdrop.addEventListener('click', closeWindowsDrawer);

window.addEventListener('popstate', () => {
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab === 'windows') openWindowsDrawer();
  else closeWindowsDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'windows') openWindowsDrawer();`, 'closeWindowsDrawer');
}
