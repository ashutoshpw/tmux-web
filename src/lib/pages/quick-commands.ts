import { cssVarsStyle } from '../theme.js';
import type { QuickCommandRecord } from '../db.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { commandbarCSS, commandbarHTML, commandbarScript } from '../commandbar.js';
import type { CommandbarSession } from '../commandbar.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from '../drawer-resize.js';
import {
	sharedLayoutCSS,
	sharedHeader,
	sharedSidebar,
	newSessionModalHTML,
	newSessionModalScript,
} from '../shared-layout.js';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCommandCard(command: QuickCommandRecord): string {
	return `<article class="quick-item" data-id="${escapeHtml(command.id)}">
  <div class="quick-card-head">
    <div>
      <div class="quick-title">${escapeHtml(command.title)}</div>
      <div class="quick-meta">${escapeHtml(command.description || 'No description')}</div>
    </div>
    <div class="quick-icon-actions">
      <button class="quick-icon-btn quick-edit" type="button" title="Edit command" aria-label="Edit ${escapeHtml(command.title)}">
        <svg viewBox="0 0 24 24"><path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25zM19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05z"/></svg>
      </button>
      <button class="quick-icon-btn quick-delete" type="button" title="Delete command" aria-label="Delete ${escapeHtml(command.title)}">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg>
      </button>
    </div>
  </div>
  <pre class="quick-command-preview"><code>${escapeHtml(command.command)}</code></pre>
</article>`;
}

export function renderQuickCommandsPage(
	commands: QuickCommandRecord[],
	theme: TmuxWebTheme,
	commandbarEnabled = false,
	commandbarSessions: CommandbarSession[] = [],
	agentsEnabled = false,
): string {
	const commandsJson = JSON.stringify(commands).replace(/</g, '\\u003c');
	const body = commands.length
		? commands.map(renderCommandCard).join('\n')
		: '<p class="empty">No quick commands yet. Add one with the button above, then use it from the terminal commandbar.</p>';

	const pageSpecificCSS = `
  .intro {
    margin: 0 0 18px; color: var(--panel-muted); font-size: 13px; line-height: 1.6;
  }
  .quick-section-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin: 24px 0 10px;
  }
  .quick-section-title {
    color: var(--panel-accent); font-size: 12px; letter-spacing: 0.08em;
    margin: 0; text-transform: uppercase;
  }
  .quick-add-btn {
    border: 1px solid var(--panel-success); border-radius: 6px;
    background: none; color: var(--panel-success); font: inherit; font-size: 12px;
    padding: 7px 12px; cursor: pointer; transition: border-color 0.15s, background 0.15s;
  }
  .quick-add-btn:hover {
    background: rgba(115, 201, 145, 0.12);
  }
  .quick-item {
    display: flex; flex-direction: column; gap: 12px;
    padding: 14px 16px; border: 1px solid var(--panel-border); border-radius: 9px;
    margin-bottom: 10px; background: var(--panel-bg);
    transition: border-color 0.15s, transform 0.15s;
  }
  .quick-item:hover {
    border-color: rgba(125, 211, 252, 0.34); transform: translateY(-1px);
  }
  .quick-card-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  }
  .quick-title {
    color: var(--page-fg); font-size: 14px; font-weight: 600; margin-bottom: 4px;
  }
  .quick-meta {
    color: var(--panel-muted); font-size: 11px; line-height: 1.5;
  }
  .quick-command-preview {
    margin: 0; padding: 10px 12px; border: 1px solid rgba(125, 211, 252, 0.12);
    border-radius: 7px; background: rgba(0, 0, 0, 0.22);
    color: var(--panel-accent); font-size: 12px; line-height: 1.5;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .quick-icon-actions {
    display: flex; gap: 6px; flex-shrink: 0;
  }
  .quick-icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border: 1px solid var(--panel-border); border-radius: 7px;
    background: none; color: var(--panel-muted); cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .quick-icon-btn svg {
    width: 15px; height: 15px; fill: currentColor;
  }
  .quick-icon-btn:hover {
    border-color: var(--panel-accent); color: var(--panel-accent); background: rgba(125, 211, 252, 0.08);
  }
  .quick-delete:hover {
    border-color: #fc8181; color: #fc8181; background: rgba(252, 129, 129, 0.08);
  }
  .quick-form label {
    display: flex; flex-direction: column; gap: 6px;
  }
  .quick-form label span {
    color: var(--panel-muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .quick-form input,
  .quick-form textarea {
    width: 100%; border: 1px solid var(--panel-border); border-radius: 6px;
    background: var(--page-bg); color: var(--page-fg); font: inherit; font-size: 12px;
    padding: 9px 10px; outline: none;
  }
  .quick-form textarea {
    min-height: 90px; resize: vertical; line-height: 1.5;
  }
  .quick-form input:focus,
  .quick-form textarea:focus {
    border-color: var(--panel-accent);
  }
  .quick-actions {
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .quick-save,
  .quick-cancel {
    border: 1px solid var(--panel-border); border-radius: 6px;
    background: none; color: var(--page-fg); font: inherit; font-size: 12px;
    padding: 7px 12px; cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .quick-save {
    border-color: var(--panel-success); color: var(--panel-success);
  }
  .quick-save:hover {
    background: rgba(115, 201, 145, 0.12);
  }
  .quick-cancel:hover {
    border-color: var(--panel-accent); color: var(--panel-accent);
  }
  .quick-drawer-backdrop {
    position: fixed; inset: 0; z-index: 600; background: rgba(0, 0, 0, 0.48);
    opacity: 0; pointer-events: none; transition: opacity 0.18s ease;
  }
  .quick-drawer-backdrop.open { opacity: 1; pointer-events: auto; }
  .quick-drawer {
    position: fixed; top: 0; right: 0; z-index: 601; height: 100vh;
    width: 460px; padding: 24px; overflow-y: auto;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    box-shadow: -18px 0 60px rgba(0, 0, 0, 0.45);
    transform: translateX(100%); transition: transform 0.2s ease;
  }
  .quick-drawer.open { transform: translateX(0); }
  ${drawerResizeCSS()}
  .quick-drawer-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    margin-bottom: 18px;
  }
  .quick-drawer-header h2 {
    margin: 0 0 6px; color: var(--panel-accent); font-size: 14px;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .quick-drawer-header p {
    margin: 0; color: var(--panel-muted); font-size: 12px; line-height: 1.5;
  }
  .quick-drawer-close {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: 24px; line-height: 1; padding: 0;
  }
  .quick-drawer-close:hover { color: var(--panel-accent); }
  #quick-edit-form {
    display: flex; flex-direction: column; gap: 12px;
  }
  .quick-error {
    display: none; margin: 0 0 12px; color: #fc8181; font-size: 12px;
  }
  .quick-error.open { display: block; }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin: 0 0 16px; }
  ${commandbarEnabled ? commandbarCSS() : ''}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Quick Commands — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'Quick Commands' })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'quickCommands', agentsEnabled, refreshHref: '/quick-commands' })}
    <main class="main-panel">
      <p class="intro">Configure reusable snippets that can be pasted into the active tmux pane from the terminal commandbar.</p>
      <p class="quick-error" id="quick-error"></p>

      <div class="quick-section-head">
        <h2 class="quick-section-title">Configured</h2>
        <button class="quick-add-btn" id="quick-add" type="button">Add Command</button>
      </div>
      <div id="quick-list">${body}</div>
    </main>
  </div>
</div>

${newSessionModalHTML()}
<div class="quick-drawer-backdrop" id="quick-edit-backdrop"></div>
<aside class="quick-drawer resizable-drawer" id="quick-edit-drawer" aria-hidden="true" aria-label="Quick command editor">
  ${drawerResizeHandleHTML()}
  <div class="quick-drawer-header">
    <div>
      <h2 id="quick-drawer-title">Edit Command</h2>
      <p id="quick-drawer-desc">Changes apply to the commandbar immediately after save.</p>
    </div>
    <button class="quick-drawer-close" id="quick-edit-close" type="button" aria-label="Close editor">&times;</button>
  </div>
  <form class="quick-form" id="quick-edit-form">
    <input name="id" type="hidden" />
    <label>
      <span>Title</span>
      <input name="title" type="text" placeholder="Run tests" autocomplete="off" />
    </label>
    <label>
      <span>Command</span>
      <textarea name="command" placeholder="bun run test" spellcheck="false"></textarea>
    </label>
    <label>
      <span>Description</span>
      <input name="description" type="text" placeholder="Optional context shown in the commandbar" autocomplete="off" />
    </label>
    <div class="quick-actions">
      <button class="quick-cancel" id="quick-edit-cancel" type="button">Cancel</button>
      <button class="quick-save" id="quick-drawer-submit" type="submit">Save</button>
    </div>
  </form>
</aside>
${commandbarEnabled ? commandbarHTML() : ''}

<script type="module">
${drawerResizeScript('quick-edit-drawer', 'tmux-web:drawer-width:quick-commands', 460)}

const commands = ${commandsJson};
const errorEl = document.getElementById('quick-error');
const editBackdrop = document.getElementById('quick-edit-backdrop');
const editDrawer = document.getElementById('quick-edit-drawer');
const editForm = document.getElementById('quick-edit-form');
const drawerTitle = document.getElementById('quick-drawer-title');
const drawerDesc = document.getElementById('quick-drawer-desc');
const drawerSubmit = document.getElementById('quick-drawer-submit');

function showError(message) {
  errorEl.textContent = message || '';
  errorEl.classList.toggle('open', !!message);
}

function setDrawerMode(mode) {
  const isCreate = mode === 'create';
  drawerTitle.textContent = isCreate ? 'Add Command' : 'Edit Command';
  drawerDesc.textContent = isCreate
    ? 'New commands appear in the terminal commandbar after save.'
    : 'Changes apply to the commandbar immediately after save.';
  drawerSubmit.textContent = isCreate ? 'Add Command' : 'Save';
  editDrawer.setAttribute('aria-label', isCreate ? 'Add quick command' : 'Edit quick command');
}

function openDrawer() {
  editDrawer.classList.add('open');
  editBackdrop.classList.add('open');
  editDrawer.setAttribute('aria-hidden', 'false');
  setTimeout(() => editForm.elements.title.focus(), 50);
}

function openCreateDrawer() {
  showError('');
  editForm.reset();
  editForm.elements.id.value = '';
  setDrawerMode('create');
  openDrawer();
}

function openEditDrawer(command) {
  showError('');
  editForm.elements.id.value = command.id;
  editForm.elements.title.value = command.title || '';
  editForm.elements.command.value = command.command || '';
  editForm.elements.description.value = command.description || '';
  setDrawerMode('edit');
  openDrawer();
}

function closeEditDrawer() {
  editDrawer.classList.remove('open');
  editBackdrop.classList.remove('open');
  editDrawer.setAttribute('aria-hidden', 'true');
}

function payloadFromForm(form) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') || ''),
    command: String(data.get('command') || ''),
    description: String(data.get('description') || ''),
  };
}

async function sendJson(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = 'request failed';
    try {
      const json = await res.json();
      if (json && json.error) message = json.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

document.getElementById('quick-add').addEventListener('click', openCreateDrawer);

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const id = String(editForm.elements.id.value || '');
  const button = editForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (id) {
      await sendJson('/api/quick-commands/' + encodeURIComponent(id), 'PATCH', payloadFromForm(editForm));
    } else {
      await sendJson('/api/quick-commands', 'POST', payloadFromForm(editForm));
    }
    location.reload();
  } catch (err) {
    showError(err instanceof Error ? err.message : (id ? 'failed to save command' : 'failed to add command'));
    button.disabled = false;
  }
});

document.getElementById('quick-list').addEventListener('click', async (event) => {
  const editButton = event.target.closest('.quick-edit');
  if (editButton) {
    const card = editButton.closest('.quick-item');
    const command = commands.find((entry) => entry.id === card?.dataset.id);
    if (command) openEditDrawer(command);
    return;
  }

  const button = event.target.closest('.quick-delete');
  if (!button) return;
  const card = button.closest('.quick-item');
  if (!card || !card.dataset.id) return;
  showError('');
  button.disabled = true;
  try {
    const res = await fetch('/api/quick-commands/' + encodeURIComponent(card.dataset.id), { method: 'DELETE' });
    if (!res.ok) throw new Error('failed to delete command');
    location.reload();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'failed to delete command');
    button.disabled = false;
  }
});

document.getElementById('quick-edit-close').addEventListener('click', closeEditDrawer);
document.getElementById('quick-edit-cancel').addEventListener('click', closeEditDrawer);
editBackdrop.addEventListener('click', closeEditDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editDrawer.classList.contains('open')) closeEditDrawer();
});

${commandbarEnabled ? commandbarScript(commandbarSessions, []) : ''}
${newSessionModalScript()}
</script>
</body>
</html>`;
}
