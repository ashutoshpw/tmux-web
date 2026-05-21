import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { escapeHtml, escapeAttr } from '../html.js';
import { notesDrawerCSS, notesDrawerHTML, notesDrawerScript } from '../notes-drawer.js';
import { schedulerDrawerCSS, schedulerDrawerHTML, schedulerDrawerScript } from '../scheduler-drawer.js';
import { windowsDrawerCSS, windowsDrawerHTML, windowsDrawerScript } from '../windows-drawer.js';
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
    <span>${escapeHtml(manifest.icon)} ${escapeHtml(manifest.name)}</span>
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
		theme: TmuxWebTheme;
		renderer?: 'xterm' | 'ghostty';
	},
): string {
	const sidebarExts = extensions.filter(e => e.slot === 'sidebar');
	const { commandbarEnabled = false, commandbarSessions = [], theme, renderer = 'xterm' } = opts;
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
		{ label: 'Switch window', meta: `Windows in ${sessionName}`, clickTargetId: 'windows-toggle' },
	];
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>tmux: ${escapeHtml(sessionName)}</title>
<style>
  ${cssVarsStyle(theme.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); height: 100%; width: 100%; overflow: hidden; }
  body { display: flex; flex-direction: column; }
  header {
    padding: 7px 16px;
    background: var(--header-gradient);
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
  #terminal-container { flex: 1; width: 100%; min-height: 0; overflow: hidden; background: var(--terminal-bg); }
  #terminal-container .xterm { height: 100%; padding: 0; }
  /* Hide whatever the active renderer mounts (xterm .xterm div or ghostty canvas)
     until the first fit, so neither renderer flashes an unsized terminal. */
  #terminal-container.terminal-pending > * { visibility: hidden; }
  #terminal-container .xterm-viewport { overflow-y: auto; }
  #terminal-container.terminal-drag-over {
    outline: 2px dashed var(--panel-accent);
    outline-offset: -2px;
    background: rgba(125, 211, 252, 0.06);
  }
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
  ${windowsDrawerCSS()}
  ${extDrawerCSS()}
</style>
</head>
<body>
<header>
  <h1><a href="/" aria-label="Go to home">tmux</a></h1>
  <span class="session">${escapeHtml(sessionName)}</span>
  ${commandbarEnabled ? commandbarButtonHTML('Sessions') : ''}
  <button class="notes-btn" id="notes-toggle" title="Session notes">
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
  </button>
  <button class="sched-btn" id="sched-toggle" title="Schedule command">
    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
  </button>
  <button class="windows-btn" id="windows-toggle" title="Switch window">
    <svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2z"/></svg>
  </button>
  ${sidebarExts.map(e => `<button class="ext-btn" id="ext-${e.id}-toggle" title="${escapeAttr(e.name)}">${escapeHtml(e.icon)}</button>`).join('\n  ')}
  <div class="status">
    <div class="dot" id="status-dot"></div>
    <span id="status-text">connecting</span>
  </div>
</header>
<div id="terminal-container" class="terminal-pending"></div>
${commandbarEnabled ? commandbarHTML() : ''}
${notesDrawerHTML(`Notes — ${sessionName}`)}
${schedulerDrawerHTML(`Scheduler — ${sessionName}`)}
${windowsDrawerHTML(`Windows — ${sessionName}`)}
${sidebarExts.map(e => extDrawerHTML(e)).join('\n')}

<script type="module">
window.__TMUX_WEB_TERMINAL__ = ${JSON.stringify({
	sessionName,
	terminal: terminalCfg,
	scrollback,
	theme: theme.terminal,
	renderer,
}).replace(/</g, '\\u003c')};
await import('/assets/terminal-client.js');

// ========== NOTES ==========
${notesDrawerScript(`session:${sessionName}`)}

// ========== SCHEDULER ==========
${schedulerDrawerScript(sessionName)}

// ========== WINDOWS ==========
${windowsDrawerScript(sessionName)}

// ========== COMMANDBAR ==========
${commandbarEnabled ? commandbarScript(commandbarSessions, commandbarActions) : ''}

// ========== NOTES ==========
// (notes and scheduler scripts already included above — extensions below)
</script>

${sidebarExts.length > 0 ? `<script>
// Extension bootstrap — plain script (not module) so it runs before the module
// awaits terminal-client import, avoiding a race where iframes load during that await.
${sidebarExts.map(e => extDrawerScript(e, sessionName)).join('\n')}
</script>` : ''}
</body>
</html>`;
}
