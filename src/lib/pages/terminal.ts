import { cssVarsStyle } from '../theme.js';
import { notesDrawerCSS, notesDrawerHTML, notesDrawerScript } from '../notes-drawer.js';
import { schedulerDrawerCSS, schedulerDrawerHTML, schedulerDrawerScript } from '../scheduler-drawer.js';
import type { ExtManifest } from '../ext-loader.js';
import {
	commandbarButtonHTML,
	commandbarCSS,
	commandbarHTML,
	commandbarScript,
	type CommandbarSession,
} from '../commandbar.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from '../drawer-resize.js';
import type { TerminalBufferConfig } from '../terminal-config.js';

function extDrawerCSS(): string {
	return `
  .ext-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  .ext-backdrop.open { opacity: 1; pointer-events: auto; }
  .ext-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  .ext-drawer.open { transform: translateX(0); }
  ${drawerResizeCSS()}
  .ext-drawer .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
  }
  .ext-drawer .drawer-header button {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  .ext-drawer .drawer-header button:hover { color: var(--panel-accent); }
  .ext-drawer iframe { flex: 1; border: none; width: 100%; height: 0; }
  header .ext-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s; font-size: 13px;
  }
  header .ext-btn:hover { color: var(--panel-accent); }`;
}

function extDrawerHTML(manifest: ExtManifest): string {
	const id = manifest.id;
	return `
<div id="ext-${id}-backdrop" class="ext-backdrop"></div>
<div id="ext-${id}-drawer" class="ext-drawer resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${manifest.icon} ${manifest.name}</span>
    <button id="ext-${id}-close">&times;</button>
  </div>
  <iframe id="ext-${id}-frame" src="/ext/${id}/ui/index.html"></iframe>
</div>`;
}

function extDrawerScript(manifest: ExtManifest, sessionName: string): string {
	const id      = manifest.id;
	const cfgJson = JSON.stringify(manifest.config);
	return `
${drawerResizeScript(`ext-${id}-drawer`, `tmux-web:drawer-width:ext:${id}`, 360)}
(function() {
  const backdrop = document.getElementById('ext-${id}-backdrop');
  const drawer   = document.getElementById('ext-${id}-drawer');
  const frame    = document.getElementById('ext-${id}-frame');
  const toggle   = document.getElementById('ext-${id}-toggle');
  const close    = document.getElementById('ext-${id}-close');

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
  }

  toggle.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer();
  });
  close.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  const cfg = ${cfgJson};

  function sendMessages() {
    frame.contentWindow.postMessage({ type: 'ext:context', context: { session: ${JSON.stringify(sessionName)}, host: location.origin } }, '*');
    frame.contentWindow.postMessage({ type: 'ext:config',  config: cfg }, '*');
  }

  // Defensive: if iframe already loaded (shouldn't happen), send immediately
  if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
    sendMessages();
  } else {
    frame.addEventListener('load', sendMessages, { once: true });
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'ext:resize' && e.source === frame.contentWindow) {
      frame.style.height = e.data.height + 'px';
    }
    // ext:ready fires when the bridge initialises — send (or re-send) config
    if (e.data?.type === 'ext:ready' && e.source === frame.contentWindow) {
      sendMessages();
    }
  });
}());`;
}

export function renderTerminal(
	sessionName: string,
	extensions: ExtManifest[] = [],
	opts: {
		commandbarEnabled?: boolean;
		commandbarSessions?: CommandbarSession[];
		terminal?: TerminalBufferConfig;
	} = {},
): string {
	const sidebarExts = extensions.filter(e => e.slot === 'sidebar');
	const { commandbarEnabled = false, commandbarSessions = [] } = opts;
	const terminalCfg = opts.terminal ?? {
		initialLines: 1000,
		historyChunk: 500,
		syncIdleMs: 200,
		syncMaxMs: 3000,
	};
	const scrollback = terminalCfg.initialLines + 2 * terminalCfg.historyChunk;
	const commandbarActions = [
		{ label: 'Open notes', meta: `Notes for ${sessionName}`, clickTargetId: 'notes-toggle' },
		{ label: 'Open scheduler', meta: `Schedule command in ${sessionName}`, clickTargetId: 'sched-toggle' },
	];
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>tmux: ${sessionName}</title>
<style>
  ${cssVarsStyle()}
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
  header h1 a {
    color: inherit;
    text-decoration: none;
  }
  header h1 a:hover,
  header h1 a:focus-visible {
    color: var(--panel-success);
    outline: none;
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
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${notesDrawerCSS()}
  ${schedulerDrawerCSS()}
  ${extDrawerCSS()}
</style>
</head>
<body>
<header>
  <h1><a href="/" aria-label="Go to home">tmux</a></h1>
  <span class="session">${sessionName}</span>
  ${commandbarEnabled ? commandbarButtonHTML('Sessions') : ''}
  <button class="notes-btn" id="notes-toggle" title="Session notes">
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
  </button>
  <button class="sched-btn" id="sched-toggle" title="Schedule command">
    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
  </button>
  ${sidebarExts.map(e => `<button class="ext-btn" id="ext-${e.id}-toggle" title="${e.name}">${e.icon}</button>`).join('\n  ')}
  <div class="status">
    <div class="dot" id="status-dot"></div>
    <span id="status-text">connecting</span>
  </div>
</header>
<div id="terminal-container"></div>
${commandbarEnabled ? commandbarHTML() : ''}
${notesDrawerHTML(`Notes — ${sessionName}`)}
${schedulerDrawerHTML(`Scheduler — ${sessionName}`)}
${sidebarExts.map(e => extDrawerHTML(e)).join('\n')}

<script type="module">
import { init, Terminal } from 'https://esm.sh/ghostty-web@latest';

await init();

const TERMINAL_CFG = ${JSON.stringify(terminalCfg)};

const term = new Terminal({
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
  cursorBlink: true,
  cursorStyle: 'bar',
  scrollback: ${scrollback},
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

let phase = 'connecting';
let serverHistoryLoaded = 0;
let historyLoading = false;
let historyParts = [];
let liveSuffix = '';

function fullLoadedText() {
  return historyParts.join('') + liveSuffix;
}

function isAtScrollbackTop() {
  const buf = term.buffer?.active;
  if (!buf) return false;
  return buf.viewportY >= buf.baseY;
}

function rewriteTerminal(preserveScroll) {
  const buf = term.buffer?.active;
  const viewportY = preserveScroll && buf ? buf.viewportY : 0;
  const baseY = preserveScroll && buf ? buf.baseY : 0;
  const text = fullLoadedText();
  term.reset();
  if (!text) {
    if (!preserveScroll) term.scrollToBottom?.();
    return;
  }
  term.write(text, () => {
    if (preserveScroll && typeof term.scrollToLine === 'function') {
      term.scrollToLine(baseY + viewportY);
    } else {
      term.scrollToBottom?.();
    }
  });
}

function handleServerMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    if (phase === 'live') {
      liveSuffix += raw;
      term.write(raw);
    }
    return;
  }

  if (msg.type === 'snapshot' && typeof msg.data === 'string') {
    historyParts = [msg.data];
    liveSuffix = '';
    serverHistoryLoaded = typeof msg.lines === 'number' ? msg.lines : TERMINAL_CFG.initialLines;
    phase = 'live';
    term.reset();
    if (msg.data) term.write(msg.data);
    term.scrollToBottom?.();
    return;
  }

  if (msg.type === 'history' && typeof msg.data === 'string') {
    historyLoading = false;
    if (msg.lines > 0 && msg.data) {
      historyParts.unshift(msg.data);
      serverHistoryLoaded += msg.lines;
      rewriteTerminal(true);
    }
    return;
  }

  if (msg.type === 'data' && typeof msg.data === 'string') {
    if (phase === 'connecting') {
      phase = 'live';
      liveSuffix = msg.data;
      term.write(msg.data);
      return;
    }
    if (phase === 'live') {
      liveSuffix += msg.data;
      term.write(msg.data);
    }
  }
}

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

function getTerminalCell(clientX, clientY) {
  const canvas = container.querySelector('canvas');
  const rect = (canvas || container).getBoundingClientRect();
  updateCellMetrics(true);
  const x = Math.max(1, Math.min(cols, Math.floor((clientX - rect.left) / charW) + 1));
  const y = Math.max(1, Math.min(rows, Math.floor((clientY - rect.top) / charH) + 1));
  return { x, y };
}

function wheelEventCount(event) {
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 1
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? rows
      : 33;
  return Math.max(1, Math.min(5, Math.round(Math.abs(event.deltaY / unit))));
}

function mouseModifierBits(event) {
  return (event.shiftKey ? 4 : 0) + (event.altKey ? 8 : 0) + (event.ctrlKey ? 16 : 0);
}

function encodeSgrMouse(button, x, y) {
  return '\\x1b[<' + button + ';' + x + ';' + y + 'M';
}

function encodeX10Mouse(button, x, y) {
  if (x > 223 || y > 223) return '';
  return '\\x1b[M'
    + String.fromCharCode(32 + button)
    + String.fromCharCode(32 + x)
    + String.fromCharCode(32 + y);
}

function sendTerminalWheel(event) {
  if (!term.hasMouseTracking?.() || event.deltaY === 0) return false;
  const { x, y } = getTerminalCell(event.clientX, event.clientY);
  const button = (event.deltaY < 0 ? 64 : 65) + mouseModifierBits(event);
  const useSgr = term.getMode?.(1006) ?? true;
  const sequence = useSgr ? encodeSgrMouse(button, x, y) : encodeX10Mouse(button, x, y);
  if (!sequence) return false;
  const count = wheelEventCount(event);
  for (let i = 0; i < count; i++) sendJSON({ type: 'input', data: sequence });
  return true;
}

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    phase = 'connecting';
    serverHistoryLoaded = 0;
    historyLoading = false;
    historyParts = [];
    liveSuffix = '';
    try { term.reset(); } catch {}
    setConnected(true);
    reconnectDelay = 1000;
    sendJSON({ type: 'resize', cols, rows });
  };
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') handleServerMessage(event.data);
  };
  ws.onclose = () => {
    setConnected(false);
    phase = 'connecting';
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      connect();
    }, reconnectDelay);
  };
  ws.onerror = () => ws.close();
}

term.onData((data) => sendJSON({ type: 'input', data }));
term.attachCustomWheelEventHandler(sendTerminalWheel);

term.onScroll(() => {
  if (phase !== 'live' || historyLoading || !isAtScrollbackTop()) return;
  historyLoading = true;
  sendJSON({ type: 'load_history', before: serverHistoryLoaded });
});

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
${notesDrawerScript(`session:${sessionName}`)}

// ========== SCHEDULER ==========
${schedulerDrawerScript(sessionName)}

// ========== COMMANDBAR ==========
${commandbarEnabled ? commandbarScript(commandbarSessions, commandbarActions) : ''}

// ========== NOTES ==========
// (notes and scheduler scripts already included above — extensions below)
</script>

${sidebarExts.length > 0 ? `<script>
// Extension bootstrap — plain script (not module) so it runs before the module
// awaits ghostty-web, avoiding a race where iframes load during that await.
${sidebarExts.map(e => extDrawerScript(e, sessionName)).join('\n')}
</script>` : ''}
</body>
</html>`;
}
