import { notesDbScript } from './notes-db.js';
import { notesUtilsScript } from './notes-utils.js';
import { closeOtherDrawersExcept, wrapDrawerScript } from './drawer-script.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from './drawer-resize.js';
import { escapeHtml } from './html.js';

export function notesDrawerCSS(): string {
	return `
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
  ${drawerResizeCSS()}
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
  #notes-editor a:hover { text-decoration: underline; }`;
}

export function notesDrawerHTML(title: string): string {
	return `
<div id="notes-backdrop"></div>
<div id="notes-drawer" class="resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${escapeHtml(title)}</span>
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
</div>`;
}

// notesDrawerScript inlines the DB helpers and utils so callers only need one include.
// innerHTML is used only after content passes through escapeHTML() then linkifyHTML(),
// making it safe against XSS from user-controlled note text.
export function notesDrawerScript(scope: string): string {
	const scopeJs = JSON.stringify(scope);
	return wrapDrawerScript('notes', `
const NOTES_SCOPE = ${scopeJs};
${notesDbScript()}
${notesUtilsScript()}
${drawerResizeScript('notes-drawer', 'tmux-web:drawer-width:notes', 360)}

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
  ${closeOtherDrawersExcept('notes')}
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
  // innerText (not textContent): Enter in contenteditable inserts <br> or blocks;
  // textContent drops those breaks and merges lines.
  notePlain = (notesEditor.innerText ?? '').replace(/\\r\\n/g, '\\n');
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
}`, 'closeDrawer');
}
