export function renderTerminal(sessionName: string): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>tmux: ${sessionName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: #111111;
    --page-fg: #d0d0d0;
    --panel-bg: #11161d;
    --panel-border: #243241;
    --panel-muted: #8a97a6;
    --panel-accent: #f3f7fb;
    --panel-success: #73c991;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); height: 100%; width: 100%; overflow: hidden; }
  body { display: flex; flex-direction: column; }
  header {
    padding: 7px 16px;
    background: linear-gradient(180deg, rgba(19, 28, 36, 0.98), rgba(13, 18, 24, 0.98));
    border-bottom: 1px solid var(--panel-border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    min-height: 38px;
  }
  header h1 {
    font-size: 13px;
    line-height: 1;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--panel-accent);
    font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    white-space: nowrap;
  }
  header .session {
    font-size: 11px;
    color: var(--panel-muted);
    font-family: 'JetBrains Mono', monospace;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(125, 211, 252, 0.12);
    padding: 4px 8px;
    border-radius: 6px;
  }
  header .status {
    margin-left: auto;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    color: var(--panel-muted);
  }
  header .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--panel-muted); transition: background 0.2s; }
  header .dot.connected { background: var(--panel-success); }
  #terminal-container { flex: 1; width: 100%; overflow: hidden; }
  header .notes-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  header .notes-btn:hover { color: var(--panel-accent); }
  header .notes-btn svg { width: 15px; height: 15px; fill: currentColor; }
  #notes-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #notes-backdrop.open { opacity: 1; pointer-events: auto; }
  #notes-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  #notes-drawer.open { transform: translateX(0); }
  .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
  }
  .drawer-header button {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  .drawer-header button:hover { color: var(--panel-accent); }
  .drawer-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px; border-bottom: 1px solid var(--panel-border);
    flex-shrink: 0; gap: 8px;
  }
  .drawer-toolbar .badge {
    font-size: 10px; color: var(--panel-success); letter-spacing: 0.1em; text-transform: uppercase;
    opacity: 0; transition: opacity 0.15s; font-family: 'JetBrains Mono', monospace;
  }
  .drawer-toolbar .badge.show { opacity: 1; }
  .drawer-toolbar .actions { display: flex; gap: 8px; align-items: center; }
  .drawer-toolbar button {
    font-size: 11px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 4px 10px; border-radius: 6px;
    cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  .drawer-toolbar button:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .drawer-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .drawer-toolbar button.flash { color: var(--panel-success); border-color: var(--panel-success); }
  #notes-editor {
    flex: 1; padding: 16px; outline: none; overflow-y: auto;
    font-size: 13px; line-height: 1.7; font-family: 'JetBrains Mono', monospace;
    white-space: pre-wrap; word-break: break-word; color: var(--page-fg);
  }
  #notes-editor:empty::before {
    content: "Double-click to add notes..."; color: var(--panel-muted); pointer-events: none;
  }
  #notes-editor[contenteditable="true"] {
    border: 1px solid rgba(125, 211, 252, 0.25);
    background: rgba(0, 0, 0, 0.2); border-radius: 4px; margin: 8px;
  }
  #notes-editor a { color: #7aa6da; text-decoration: none; }
  #notes-editor a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>tmux</h1>
  <span class="session">${sessionName}</span>
  <button class="notes-btn" id="notes-toggle" title="Session notes">
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
  </button>
  <div class="status">
    <div class="dot" id="status-dot"></div>
    <span id="status-text">connecting</span>
  </div>
</header>
<div id="terminal-container"></div>

<div id="notes-backdrop"></div>
<div id="notes-drawer">
  <div class="drawer-header">
    <span>Notes — ${sessionName}</span>
    <button id="drawer-close">&times;</button>
  </div>
  <div class="drawer-toolbar">
    <span class="badge" id="edit-badge">Editing</span>
    <div class="actions">
      <button id="notes-copy">Copy</button>
      <button id="notes-export">Export .md</button>
    </div>
  </div>
  <div id="notes-editor"></div>
</div>

<script type="module">
import { init, Terminal } from 'https://esm.sh/ghostty-web@latest';

await init();

const term = new Terminal({
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
  cursorBlink: true,
  cursorStyle: 'bar',
  scrollback: 50000,
  convertEol: false,
  theme: {
    foreground: '#ffffff',
    background: '#282c34',
    cursor: '#ffffff',
    cursorAccent: '#282c34',
    selectionBackground: '#ffffff',
    selectionForeground: '#282c34',
    black: '#1d1f21',
    red: '#cc6666',
    green: '#b5bd68',
    yellow: '#f0c674',
    blue: '#81a2be',
    magenta: '#b294bb',
    cyan: '#8abeb7',
    white: '#c5c8c6',
    brightBlack: '#666666',
    brightRed: '#d54e53',
    brightGreen: '#b9ca4a',
    brightYellow: '#e7c547',
    brightBlue: '#7aa6da',
    brightMagenta: '#c397d8',
    brightCyan: '#70c0b1',
    brightWhite: '#eaeaea',
  },
});

const container = document.getElementById('terminal-container');
term.open(container);

let cols = 80, rows = 24, ws, charW = 0, charH = 0;
let fitRaf = 0;
let fitTimer = 0;
let touchGesture = null;
let suppressTouchClickUntil = 0;

function updateCellMetrics(force = false) {
  const canvas = container.querySelector('canvas');
  if (canvas && canvas.offsetWidth > 0 && canvas.offsetHeight > 0 && cols > 0 && rows > 0) {
    const nextW = canvas.offsetWidth / cols;
    const nextH = canvas.offsetHeight / rows;
    if (force || !charW || !charH) {
      charW = nextW;
      charH = nextH;
    }
  }
  if (!charW || !charH) {
    charW = 9.0;
    charH = 18;
  }
}

function getTerminalViewportRect() {
  const rect = container.getBoundingClientRect();
  const vv = window.visualViewport;
  if (!vv) return rect;
  return {
    width: Math.min(rect.width, vv.width),
    height: Math.max(0, Math.min(rect.height, vv.height - Math.max(0, rect.top))),
  };
}

function fitTerminal(force = false) {
  const rect = getTerminalViewportRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  updateCellMetrics(force && (!charW || !charH));
  const nc = Math.floor(rect.width / charW);
  const nr = Math.floor(rect.height / charH);
  if (nc < 10 || nr < 5) return;
  if (force || nc !== cols || nr !== rows) {
    cols = nc;
    rows = nr;
    term.resize(cols, rows);
    sendJSON({ type: 'resize', cols, rows });
  }
}

function scheduleFit(force = false) {
  if (fitRaf) cancelAnimationFrame(fitRaf);
  clearTimeout(fitTimer);
  fitTerminal(force);
  fitRaf = requestAnimationFrame(() => { fitRaf = 0; fitTerminal(force); });
  fitTimer = setTimeout(() => fitTerminal(force), 120);
}

scheduleFit(true);
window.addEventListener('resize', () => scheduleFit(true));
window.visualViewport?.addEventListener('resize', () => scheduleFit(true));
window.visualViewport?.addEventListener('scroll', () => scheduleFit(true));
new ResizeObserver(() => scheduleFit(true)).observe(container);

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    scheduleFit(true);
    setTimeout(() => scheduleFit(true), 50);
    setTimeout(() => scheduleFit(true), 200);
  });
}

function scheduleKeyboardFit() {
  scheduleFit(true);
  setTimeout(() => scheduleFit(true), 50);
  setTimeout(() => scheduleFit(true), 150);
  setTimeout(() => scheduleFit(true), 300);
}

container.addEventListener('focusin', () => scheduleKeyboardFit(), true);

const dot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
function setConnected(ok) {
  dot.className = 'dot' + (ok ? ' connected' : '');
  statusText.textContent = ok ? 'connected' : 'reconnecting';
}

const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = proto + '//' + location.host + '/ws/${sessionName}';
let reconnectDelay = 1000;
const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);

function sendJSON(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    try { term.reset(); } catch {}
    setConnected(true);
    reconnectDelay = 1000;
    sendJSON({ type: 'resize', cols, rows });
  };
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') term.write(event.data);
  };
  ws.onclose = () => {
    setConnected(false);
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      connect();
    }, reconnectDelay);
  };
  ws.onerror = () => ws.close();
}

term.onData((data) => sendJSON({ type: 'input', data }));

document.addEventListener('keydown', (event) => {
  if (!isSafari || event.key !== 'Escape') return;
  if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  const active = document.activeElement;
  const terminalFocused = active === container || active === term.textarea || container.contains(active);
  if (!terminalFocused) return;
  event.preventDefault();
  event.stopPropagation();
  sendJSON({ type: 'input', data: '\\x1b' });
}, true);

function dispatchTerminalWheel(deltaY, clientX, clientY) {
  const target = container.querySelector('canvas') || container;
  target.dispatchEvent(new WheelEvent('wheel', {
    deltaY, deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    clientX, clientY, bubbles: true, cancelable: true,
  }));
}

function focusTerminal() {
  const active = term.textarea || container.querySelector('textarea') || container;
  active?.focus?.();
  scheduleKeyboardFit();
}

container.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1) { touchGesture = null; return; }
  const touch = event.touches[0];
  touchGesture = { startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, scrolling: false };
  event.stopPropagation();
}, { passive: true, capture: true });

container.addEventListener('touchmove', (event) => {
  if (!touchGesture || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const totalDy = touch.clientY - touchGesture.startY;
  const totalDx = touch.clientX - touchGesture.startX;
  if (!touchGesture.scrolling) {
    if (Math.abs(totalDy) < 8 || Math.abs(totalDy) < Math.abs(totalDx)) return;
    touchGesture.scrolling = true;
    suppressTouchClickUntil = Date.now() + 500;
  }
  event.preventDefault();
  event.stopPropagation();
  dispatchTerminalWheel(-(touch.clientY - touchGesture.lastY), touch.clientX, touch.clientY);
  touchGesture.lastX = touch.clientX;
  touchGesture.lastY = touch.clientY;
}, { passive: false, capture: true });

container.addEventListener('touchend', (event) => {
  if (!touchGesture) return;
  const wasScrolling = touchGesture.scrolling;
  touchGesture = null;
  event.stopPropagation();
  if (!wasScrolling) focusTerminal();
  else { suppressTouchClickUntil = Date.now() + 500; event.preventDefault(); }
}, { passive: false, capture: true });

container.addEventListener('touchcancel', (event) => {
  touchGesture = null;
  event.stopPropagation();
}, { passive: true, capture: true });

container.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch' && Date.now() < suppressTouchClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

connect();

// ========== NOTES ==========
const NOTES_SCOPE = 'session:${sessionName}';
const DB_NAME = 'tmux-web-notes';
const DB_STORE = 'notes';
const DB_VERSION = 1;

let dbPromise = null;
function openNotesDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function loadNote(scope) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.get(scope);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveNote(scope, content) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.put({ id: scope, content, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function linkifyHTML(text) {
  const urlRe = /https?:\\/\\/[^\\s<>"]+/g;
  return text.replace(urlRe, (url) => 
    \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${url}</a>\`
  );
}

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const notesBackdrop = document.getElementById('notes-backdrop');
const notesDrawer = document.getElementById('notes-drawer');
const notesEditor = document.getElementById('notes-editor');
const notesToggle = document.getElementById('notes-toggle');
const drawerClose = document.getElementById('drawer-close');
const editBadge = document.getElementById('edit-badge');
const copyBtn = document.getElementById('notes-copy');
const exportBtn = document.getElementById('notes-export');

let notePlain = '';
let editing = false;

function setButtonsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  exportBtn.disabled = !enabled;
}

async function renderNote() {
  const rec = await loadNote(NOTES_SCOPE);
  notePlain = rec?.content || '';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  setButtonsEnabled(!!notePlain);
}

function openDrawer() {
  notesDrawer.classList.add('open');
  notesBackdrop.classList.add('open');
  renderNote();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'notes') {
    url.searchParams.set('tab', 'notes');
    history.pushState({ notesOpen: true }, '', url);
  }
}

function closeDrawer() {
  notesDrawer.classList.remove('open');
  notesBackdrop.classList.remove('open');
  if (editing) stopEditing();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'notes') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

function startEditing() {
  editing = true;
  notesEditor.contentEditable = 'true';
  notesEditor.textContent = notePlain;
  editBadge.classList.add('show');
  notesEditor.focus();
}

async function stopEditing() {
  if (!editing) return;
  editing = false;
  notePlain = notesEditor.textContent || '';
  notesEditor.contentEditable = 'false';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  editBadge.classList.remove('show');
  await saveNote(NOTES_SCOPE, notePlain);
  setButtonsEnabled(!!notePlain);
}

notesToggle.addEventListener('click', () => {
  if (notesDrawer.classList.contains('open')) closeDrawer();
  else openDrawer();
});

drawerClose.addEventListener('click', closeDrawer);
notesBackdrop.addEventListener('click', closeDrawer);

notesEditor.addEventListener('dblclick', (e) => {
  if (!editing) { e.preventDefault(); startEditing(); }
});

notesEditor.addEventListener('blur', () => { if (editing) stopEditing(); });

notesEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editing) { e.preventDefault(); stopEditing(); }
});

copyBtn.addEventListener('click', async () => {
  if (!notePlain) return;
  try {
    await navigator.clipboard.writeText(notePlain);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('flash');
    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('flash'); }, 1500);
  } catch {}
});

exportBtn.addEventListener('click', () => {
  if (!notePlain) return;
  const blob = new Blob([notePlain], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safeName = NOTES_SCOPE.replace(/[:\\/\\\\]/g, '-');
  a.download = \`notes-\${safeName}.md\`;
  a.click();
  URL.revokeObjectURL(a.href);
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'notes') openDrawer();
  else closeDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'notes') {
  openDrawer();
}
</script>
</body>
</html>`;
}

export function renderLanding(
	sessions: Array<{ name: string; windows: number; attached: boolean }>,
): string {
	const rows = sessions
		.map(
			(s) =>
				`<a href="/s/${encodeURIComponent(s.name)}" class="session-row">
      <span class="name">${s.name}</span>
      <span class="meta">${s.windows} window${s.windows !== 1 ? "s" : ""}${s.attached ? " &middot; attached" : ""}</span>
    </a>`,
		)
		.join("\n");

	const empty = sessions.length === 0
		? `<p class="empty">No tmux sessions found.<br>Create one with <code>tmux new -s mysession</code></p>`
		: "";

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>tmux-web</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: #111111;
    --page-fg: #d0d0d0;
    --panel-bg: #11161d;
    --panel-border: #243241;
    --panel-muted: #8a97a6;
    --panel-accent: #f3f7fb;
    --panel-success: #73c991;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace; }
  .container { max-width: 520px; margin: 80px auto; padding: 0 20px; }
  h1 { font-size: 18px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--panel-accent); margin-bottom: 32px; }
  .session-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 8px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s;
  }
  .session-row:hover { border-color: var(--panel-success); }
  .session-row .name { font-size: 14px; font-weight: 500; color: var(--panel-accent); }
  .session-row .meta { font-size: 11px; color: var(--panel-muted); }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; }
  .empty code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  .refresh { display: inline-block; margin-top: 24px; font-size: 12px; color: var(--panel-muted); text-decoration: none; border: 1px solid var(--panel-border); padding: 6px 14px; border-radius: 6px; }
  .refresh:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .landing-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 32px;
  }
  .landing-header .notes-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s; font-size: 11px;
  }
  .landing-header .notes-btn:hover { color: var(--panel-accent); }
  .landing-header .notes-btn svg { width: 15px; height: 15px; fill: currentColor; }
  #notes-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #notes-backdrop.open { opacity: 1; pointer-events: auto; }
  #notes-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  #notes-drawer.open { transform: translateX(0); }
  .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
  }
  .drawer-header button {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  .drawer-header button:hover { color: var(--panel-accent); }
  .drawer-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px; border-bottom: 1px solid var(--panel-border);
    flex-shrink: 0; gap: 8px;
  }
  .drawer-toolbar .badge {
    font-size: 10px; color: var(--panel-success); letter-spacing: 0.1em; text-transform: uppercase;
    opacity: 0; transition: opacity 0.15s; font-family: 'JetBrains Mono', monospace;
  }
  .drawer-toolbar .badge.show { opacity: 1; }
  .drawer-toolbar .actions { display: flex; gap: 8px; align-items: center; }
  .drawer-toolbar button {
    font-size: 11px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 4px 10px; border-radius: 6px;
    cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  .drawer-toolbar button:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .drawer-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .drawer-toolbar button.flash { color: var(--panel-success); border-color: var(--panel-success); }
  #notes-editor {
    flex: 1; padding: 16px; outline: none; overflow-y: auto;
    font-size: 13px; line-height: 1.7; font-family: 'JetBrains Mono', monospace;
    white-space: pre-wrap; word-break: break-word; color: var(--page-fg);
  }
  #notes-editor:empty::before {
    content: "Double-click to add notes..."; color: var(--panel-muted); pointer-events: none;
  }
  #notes-editor[contenteditable="true"] {
    border: 1px solid rgba(125, 211, 252, 0.25);
    background: rgba(0, 0, 0, 0.2); border-radius: 4px; margin: 8px;
  }
  #notes-editor a { color: #7aa6da; text-decoration: none; }
  #notes-editor a:hover { text-decoration: underline; }
  .notes-link {
    display: inline-block; margin-top: 16px; font-size: 12px;
    color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 6px 14px; border-radius: 6px;
  }
  .notes-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
</style>
</head>
<body>
<div class="container">
  <div class="landing-header">
    <h1>tmux sessions</h1>
    <button class="notes-btn" id="notes-toggle" title="Global notes">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
      Notes
    </button>
  </div>
  ${rows}
  ${empty}
  <a href="/" class="refresh">refresh</a>
  <a href="/notes" class="notes-link">View all notes</a>
</div>

<div id="notes-backdrop"></div>
<div id="notes-drawer">
  <div class="drawer-header">
    <span>Notes — Global</span>
    <button id="drawer-close">&times;</button>
  </div>
  <div class="drawer-toolbar">
    <span class="badge" id="edit-badge">Editing</span>
    <div class="actions">
      <button id="notes-copy">Copy</button>
      <button id="notes-export">Export .md</button>
    </div>
  </div>
  <div id="notes-editor"></div>
</div>

<script type="module">
const NOTES_SCOPE = '__global__';
const DB_NAME = 'tmux-web-notes';
const DB_STORE = 'notes';
const DB_VERSION = 1;

let dbPromise = null;
function openNotesDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function loadNote(scope) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.get(scope);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveNote(scope, content) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.put({ id: scope, content, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function linkifyHTML(text) {
  const urlRe = /https?:\\/\\/[^\\s<>"]+/g;
  return text.replace(urlRe, (url) => 
    \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${url}</a>\`
  );
}

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const notesBackdrop = document.getElementById('notes-backdrop');
const notesDrawer = document.getElementById('notes-drawer');
const notesEditor = document.getElementById('notes-editor');
const notesToggle = document.getElementById('notes-toggle');
const drawerClose = document.getElementById('drawer-close');
const editBadge = document.getElementById('edit-badge');
const copyBtn = document.getElementById('notes-copy');
const exportBtn = document.getElementById('notes-export');

let notePlain = '';
let editing = false;

function setButtonsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  exportBtn.disabled = !enabled;
}

async function renderNote() {
  const rec = await loadNote(NOTES_SCOPE);
  notePlain = rec?.content || '';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  setButtonsEnabled(!!notePlain);
}

function openDrawer() {
  notesDrawer.classList.add('open');
  notesBackdrop.classList.add('open');
  renderNote();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'notes') {
    url.searchParams.set('tab', 'notes');
    history.pushState({ notesOpen: true }, '', url);
  }
}

function closeDrawer() {
  notesDrawer.classList.remove('open');
  notesBackdrop.classList.remove('open');
  if (editing) stopEditing();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'notes') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

function startEditing() {
  editing = true;
  notesEditor.contentEditable = 'true';
  notesEditor.textContent = notePlain;
  editBadge.classList.add('show');
  notesEditor.focus();
}

async function stopEditing() {
  if (!editing) return;
  editing = false;
  notePlain = notesEditor.textContent || '';
  notesEditor.contentEditable = 'false';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  editBadge.classList.remove('show');
  await saveNote(NOTES_SCOPE, notePlain);
  setButtonsEnabled(!!notePlain);
}

notesToggle.addEventListener('click', () => {
  if (notesDrawer.classList.contains('open')) closeDrawer();
  else openDrawer();
});

drawerClose.addEventListener('click', closeDrawer);
notesBackdrop.addEventListener('click', closeDrawer);

notesEditor.addEventListener('dblclick', (e) => {
  if (!editing) { e.preventDefault(); startEditing(); }
});

notesEditor.addEventListener('blur', () => { if (editing) stopEditing(); });

notesEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editing) { e.preventDefault(); stopEditing(); }
});

copyBtn.addEventListener('click', async () => {
  if (!notePlain) return;
  try {
    await navigator.clipboard.writeText(notePlain);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('flash');
    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('flash'); }, 1500);
  } catch {}
});

exportBtn.addEventListener('click', () => {
  if (!notePlain) return;
  const blob = new Blob([notePlain], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'notes-global.md';
  a.click();
  URL.revokeObjectURL(a.href);
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'notes') openDrawer();
  else closeDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'notes') {
  openDrawer();
}
</script>
</body>
</html>`;
}

export function renderNotesIndex(): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Notes — tmux-web</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: #111111;
    --page-fg: #d0d0d0;
    --panel-bg: #11161d;
    --panel-border: #243241;
    --panel-muted: #8a97a6;
    --panel-accent: #f3f7fb;
    --panel-success: #73c991;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace; }
  .container { max-width: 640px; margin: 60px auto; padding: 0 20px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
  h1 { font-size: 18px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--panel-accent); }
  .back-link {
    font-size: 12px; color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 6px 14px; border-radius: 6px; transition: all 0.15s;
  }
  .back-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .note-card {
    display: block; padding: 14px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 10px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s; cursor: pointer;
  }
  .note-card:hover { border-color: var(--panel-success); }
  .note-card .label {
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); margin-bottom: 6px;
  }
  .note-card .label.global { color: var(--panel-success); }
  .note-card .preview {
    font-size: 12px; color: var(--panel-muted); line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .note-card .meta {
    font-size: 11px; color: var(--panel-muted); margin-top: 8px;
    display: flex; justify-content: space-between;
  }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  #loading { font-size: 13px; color: var(--panel-muted); }
</style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <h1>All notes</h1>
    <a href="/" class="back-link">Back</a>
  </div>
  <div id="notes-list"><p id="loading">Loading...</p></div>
</div>

<script type="module">
const DB_NAME = 'tmux-web-notes';
const DB_STORE = 'notes';
const DB_VERSION = 1;

let dbPromise = null;
function openNotesDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function listAllNotes() {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
  const list = document.getElementById('notes-list');
  try {
    const notes = await listAllNotes();
    if (!notes.length) {
      list.innerHTML = '<p class="empty">No notes yet.</p>';
      return;
    }
    // sort by updatedAt desc
    notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    list.innerHTML = notes.map((n) => {
      const isGlobal = n.id === '__global__';
      const label = isGlobal ? 'Global' : n.id.replace(/^session:/, '');
      const href = isGlobal ? '/notes/__global__' : '/notes/' + encodeURIComponent(n.id.replace(/^session:/, ''));
      const preview = (n.content || '').slice(0, 200).trim() || '—';
      const date = formatDate(n.updatedAt);
      return \`<a class="note-card" href="\${href}">
        <div class="label \${isGlobal ? 'global' : ''}">\${label}</div>
        <div class="preview">\${preview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="meta"><span>\${date}</span></div>
      </a>\`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<p class="empty">Failed to load notes.</p>';
  }
}

render();
</script>
</body>
</html>`;
}

export function renderNotesPage(session: string): string {
	const isGlobal = session === '__global__';
	const label = isGlobal ? 'Global' : session;
	const scope = isGlobal ? '__global__' : 'session:' + session;
	const backHref = '/notes';
	const exportName = isGlobal ? 'notes-global' : 'notes-session-' + session.replace(/[:\/\\]/g, '-');

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Notes — ${label} — tmux-web</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: #111111;
    --page-fg: #d0d0d0;
    --panel-bg: #11161d;
    --panel-border: #243241;
    --panel-muted: #8a97a6;
    --panel-accent: #f3f7fb;
    --panel-success: #73c991;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace; }
  .container { max-width: 720px; margin: 40px auto; padding: 0 20px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .breadcrumb { font-size: 12px; color: var(--panel-muted); }
  .breadcrumb a { color: var(--panel-muted); text-decoration: none; }
  .breadcrumb a:hover { color: var(--panel-accent); }
  .breadcrumb span { color: var(--panel-accent); font-weight: 500; }
  .toolbar {
    display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px;
    border-bottom: 1px solid var(--panel-border);
  }
  .toolbar button {
    font-size: 11px; color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 5px 12px; border-radius: 6px;
    cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.15s;
  }
  .toolbar button:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .toolbar button.flash { color: var(--panel-success); border-color: var(--panel-success); }
  .toolbar .badge {
    font-size: 10px; color: var(--panel-success); letter-spacing: 0.1em; text-transform: uppercase;
    opacity: 0; transition: opacity 0.15s; margin-left: auto;
  }
  .toolbar .badge.show { opacity: 1; }
  #notes-editor {
    min-height: 400px; padding: 16px; outline: none;
    font-size: 13px; line-height: 1.7; font-family: 'JetBrains Mono', monospace;
    white-space: pre-wrap; word-break: break-word; color: var(--page-fg);
    border: 1px solid transparent; border-radius: 4px;
    transition: border-color 0.15s, background 0.15s;
  }
  #notes-editor:empty::before {
    content: "Double-click to edit notes..."; color: var(--panel-muted); pointer-events: none;
  }
  #notes-editor[contenteditable="true"] {
    border: 1px solid rgba(125, 211, 252, 0.25);
    background: rgba(0, 0, 0, 0.2);
  }
  #notes-editor a { color: #7aa6da; text-decoration: none; }
  #notes-editor a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <div class="breadcrumb">
      <a href="${backHref}">Notes</a> <span>/</span> <span>${label}</span>
    </div>
  </div>
  <div class="toolbar">
    <button id="notes-copy">Copy</button>
    <button id="notes-export">Export .md</button>
    <span class="badge" id="edit-badge">Editing</span>
  </div>
  <div id="notes-editor"></div>
</div>

<script type="module">
const NOTES_SCOPE = '${scope}';
const DB_NAME = 'tmux-web-notes';
const DB_STORE = 'notes';
const DB_VERSION = 1;

let dbPromise = null;
function openNotesDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function loadNote(scope) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.get(scope);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveNote(scope, content) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.put({ id: scope, content, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function linkifyHTML(text) {
  const urlRe = /https?:\\/\\/[^\\s<>"]+/g;
  return text.replace(urlRe, (url) => 
    \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${url}</a>\`
  );
}

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const notesEditor = document.getElementById('notes-editor');
const copyBtn = document.getElementById('notes-copy');
const exportBtn = document.getElementById('notes-export');
const editBadge = document.getElementById('edit-badge');

let notePlain = '';
let editing = false;

function setButtonsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  exportBtn.disabled = !enabled;
}

async function renderNote() {
  const rec = await loadNote(NOTES_SCOPE);
  notePlain = rec?.content || '';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  setButtonsEnabled(!!notePlain);
}

function startEditing() {
  editing = true;
  notesEditor.contentEditable = 'true';
  notesEditor.textContent = notePlain;
  editBadge.classList.add('show');
  notesEditor.focus();
}

async function stopEditing() {
  if (!editing) return;
  editing = false;
  notePlain = notesEditor.textContent || '';
  notesEditor.contentEditable = 'false';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  editBadge.classList.remove('show');
  await saveNote(NOTES_SCOPE, notePlain);
  setButtonsEnabled(!!notePlain);
}

notesEditor.addEventListener('dblclick', (e) => {
  if (!editing) { e.preventDefault(); startEditing(); }
});

notesEditor.addEventListener('blur', () => { if (editing) stopEditing(); });

notesEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editing) { e.preventDefault(); stopEditing(); }
});

copyBtn.addEventListener('click', async () => {
  if (!notePlain) return;
  try {
    await navigator.clipboard.writeText(notePlain);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('flash');
    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('flash'); }, 1500);
  } catch {}
});

exportBtn.addEventListener('click', () => {
  if (!notePlain) return;
  const blob = new Blob([notePlain], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '${exportName}.md';
  a.click();
  URL.revokeObjectURL(a.href);
});

renderNote();
</script>
</body>
</html>`;
}
