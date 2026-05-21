import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { escapeHtml } from '../html.js';
import { notesDbScript } from '../notes-db.js';
import { notesUtilsScript } from '../notes-utils.js';

export function renderNotesPage(session: string, theme: TmuxWebTheme): string {
	const isGlobal = session === '__global__';
	const label = isGlobal ? 'Global' : session;
	const scope = isGlobal ? '__global__' : 'session:' + session;
	const backHref = '/notes';
	const exportName = isGlobal ? 'notes-global' : 'notes-session-' + session.replace(/[:\/\\]/g, '-');
	const scopeJs = JSON.stringify(scope);
	const exportNameJs = JSON.stringify(`${exportName}.md`);
	const labelHtml = escapeHtml(label);

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Notes - ${labelHtml} - tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
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
      <a href="${backHref}">Notes</a> <span>/</span> <span>${labelHtml}</span>
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
const NOTES_SCOPE = ${scopeJs};
${notesDbScript()}
${notesUtilsScript()}

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
  // innerText (not textContent): Enter in contenteditable inserts <br> or blocks;
  // textContent drops those breaks and merges lines.
  notePlain = (notesEditor.innerText ?? '').replace(/\\r\\n/g, '\\n');
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
  a.download = ${exportNameJs};
  a.click();
  URL.revokeObjectURL(a.href);
});

renderNote();
</script>
</body>
</html>`;
}
