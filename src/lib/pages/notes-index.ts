import { cssVarsStyle } from '../theme.js';
import type { NoteRecord } from '../db.js';
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

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function renderNotesIndex(
	notes: NoteRecord[],
	theme: TmuxWebTheme,
	commandbarEnabled = false,
	commandbarSessions: CommandbarSession[] = [],
	agentsEnabled = false,
): string {
	const sorted = [...notes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

	const cards = sorted.map((n) => {
		const isGlobal = n.scope === '__global__';
		const label = isGlobal ? 'Global' : n.scope.replace(/^session:/, '');
		const href = isGlobal ? '/notes/__global__' : '/notes/' + encodeURIComponent(n.scope.replace(/^session:/, ''));
		const preview = escapeHtml((n.content || '').slice(0, 200).trim() || '—');
		const date = escapeHtml(formatDate(n.updatedAt));
		return `<a class="note-card" href="${href}">
  <div class="label ${isGlobal ? 'global' : ''}">${escapeHtml(label)}</div>
  <div class="preview">${preview}</div>
  <div class="meta"><span>${date}</span></div>
</a>`;
	}).join('\n');

	const body = sorted.length
		? cards
		: '<p class="empty">No notes yet.</p>';

	const pageSpecificCSS = `
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
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${notesDrawerCSS()}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Notes — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'All Notes' })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'notes', agentsEnabled, refreshHref: '/notes' })}
    <main class="main-panel">
      <div id="notes-list">${body}</div>
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
</body>
</html>`;
}
