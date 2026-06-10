import { commandbarButtonHTML } from './commandbar.js';

export type ActivePage = 'home' | 'notes' | 'schedule' | 'agents';

/** Base CSS for the fixed header, two-column layout, sidebar, and new-session modal. */
export function sharedLayoutCSS(extraCSS = ''): string {
	return `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace; margin: 0; padding: 0; }

  /* ── Fixed header ── */
  .fixed-header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    background: var(--panel-bg); border-bottom: 1px solid var(--panel-border);
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 24px; height: 52px;
  }
  .fixed-header h1 {
    font-size: 13px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--panel-accent); margin: 0;
  }
  .header-actions { display: flex; align-items: center; gap: 8px; }
  .header-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 4px 8px; border-radius: 4px; transition: color 0.15s; font-size: 11px;
    text-decoration: none; font-family: inherit;
  }
  .header-btn:hover { color: var(--panel-accent); }
  .header-btn svg { width: 14px; height: 14px; fill: currentColor; flex-shrink: 0; }

  /* ── Page layout ── */
  .page-wrap { padding-top: 52px; }
  .page-layout {
    display: flex; gap: 0; max-width: 1100px; margin: 0 auto; padding: 32px 24px;
    align-items: flex-start;
  }

  /* ── Main content panel ── */
  .main-panel { flex: 2; min-width: 0; }

  /* ── Action sidebar (1/3) ── */
  .action-sidebar {
    flex: 1; max-width: 240px; min-width: 180px;
    margin-right: 32px; position: sticky; top: 72px;
  }
  .sidebar-label {
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--panel-muted); margin: 0 0 10px 4px;
  }
  .sidebar-btn {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 9px 12px; border: 1px solid var(--panel-border); border-radius: 7px;
    background: var(--panel-bg); color: var(--page-fg); cursor: pointer;
    font-size: 12px; font-family: inherit; text-decoration: none;
    transition: border-color 0.15s, color 0.15s; margin-bottom: 6px;
    text-align: left;
  }
  .sidebar-btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .sidebar-btn.primary { border-color: var(--panel-accent); color: var(--panel-accent); }
  .sidebar-btn.primary:hover { opacity: 0.8; }
  .sidebar-btn.current {
    border-color: var(--panel-accent); color: var(--panel-accent);
    opacity: 0.6; cursor: default; pointer-events: none;
  }
  .sidebar-btn svg { width: 14px; height: 14px; fill: currentColor; flex-shrink: 0; }
  .sidebar-divider { border: none; border-top: 1px solid var(--panel-border); margin: 10px 0; }

  /* ── New session modal ── */
  .modal-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55);
    z-index: 500; align-items: center; justify-content: center;
  }
  .modal-backdrop.open { display: flex; }
  .modal-panel {
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 24px; width: 100%; max-width: 440px;
    margin: 0 16px;
  }
  .modal-panel h2 { font-size: 14px; font-weight: 600; margin: 0 0 20px; color: var(--panel-accent); letter-spacing: 0.06em; text-transform: uppercase; }
  .modal-field { margin-bottom: 16px; }
  .modal-field label { display: block; font-size: 11px; color: var(--panel-muted); margin-bottom: 6px; letter-spacing: 0.05em; text-transform: uppercase; }
  .modal-field input {
    width: 100%; padding: 9px 12px; background: var(--page-bg);
    border: 1px solid var(--panel-border); border-radius: 6px;
    color: var(--page-fg); font-size: 13px; font-family: inherit;
    outline: none; transition: border-color 0.15s;
  }
  .modal-field input:focus { border-color: var(--panel-accent); }
  .modal-error { font-size: 12px; color: #fc8181; margin-bottom: 12px; display: none; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .modal-btn {
    padding: 8px 18px; border-radius: 6px; font-size: 12px; font-family: inherit;
    cursor: pointer; border: 1px solid var(--panel-border); background: none;
    color: var(--page-fg); transition: border-color 0.15s, color 0.15s;
  }
  .modal-btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .modal-btn.confirm {
    background: var(--panel-accent); border-color: var(--panel-accent);
    color: var(--page-bg); font-weight: 600;
  }
  .modal-btn.confirm:hover { opacity: 0.85; }

  /* ── Mobile ── */
  @media (max-width: 767px) {
    .page-layout { flex-direction: column; padding: 20px 16px; gap: 0; }
    .action-sidebar { max-width: 100%; min-width: 0; width: 100%; margin-right: 0; margin-bottom: 24px; position: static; order: -1; }
    .fixed-header { padding: 0 16px; }
  }

  ${extraCSS}`;
}

/** Fixed header HTML. Title defaults to "TMUX Sessions". */
export function sharedHeader(opts: {
	commandbarEnabled: boolean;
	title?: string;
}): string {
	const { commandbarEnabled, title = 'TMUX Sessions' } = opts;
	return `<header class="fixed-header">
  <h1>${title}</h1>
  <div class="header-actions">
    ${commandbarEnabled ? commandbarButtonHTML('Search') : ''}
    <button class="header-btn" id="notes-toggle" title="Global notes">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
      Notes
    </button>
    <a class="header-btn" href="/settings" title="Settings">
      <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
      Settings
    </a>
  </div>
</header>`;
}

/** Sidebar HTML with the current page indicated and agents link conditional. */
export function sharedSidebar(opts: {
	activePage: ActivePage;
	agentsEnabled: boolean;
	refreshHref: string;
}): string {
	const { activePage, agentsEnabled, refreshHref } = opts;

	function btn(page: ActivePage | null, href: string, icon: string, label: string, extra = '') {
		const isCurrent = page !== null && page === activePage;
		const cls = isCurrent ? 'sidebar-btn current' : 'sidebar-btn';
		return `<a href="${href}" class="${cls}"${extra}>
        <svg viewBox="0 0 24 24">${icon}</svg>
        ${label}
      </a>`;
	}

	const sessionsIcon = '<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>';
	const notesIcon = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/>';
	const scheduleIcon = '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>';
	const agentsIcon = '<path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zm0 12c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4z"/>';
	const refreshIcon = '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>';

	return `<aside class="action-sidebar">
      <p class="sidebar-label">Actions</p>
      <button class="sidebar-btn primary" id="new-session-btn">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        New Session
      </button>
      <hr class="sidebar-divider">
      ${btn('home', '/', sessionsIcon, 'Sessions')}
      ${btn('notes', '/notes', notesIcon, 'All Notes')}
      ${btn('schedule', '/schedule', scheduleIcon, 'Scheduled')}
      ${agentsEnabled ? btn('agents', '/agents', agentsIcon, 'All Agents') : ''}
      <hr class="sidebar-divider">
      <a href="${refreshHref}" class="sidebar-btn">
        <svg viewBox="0 0 24 24">${refreshIcon}</svg>
        Refresh
      </a>
    </aside>`;
}

/** New session modal HTML (hidden by default). */
export function newSessionModalHTML(): string {
	return `<div class="modal-backdrop" id="new-session-modal" role="dialog" aria-modal="true" aria-label="Create new tmux session">
  <div class="modal-panel">
    <h2>New Session</h2>
    <div class="modal-field">
      <label for="ns-name">Session name</label>
      <input type="text" id="ns-name" placeholder="e.g. myproject" autocomplete="off" spellcheck="false" />
    </div>
    <div class="modal-field">
      <label for="ns-dir">Start directory</label>
      <input type="text" id="ns-dir" placeholder="~" autocomplete="off" spellcheck="false" list="ns-dir-list" />
      <datalist id="ns-dir-list"></datalist>
    </div>
    <p class="modal-error" id="ns-error"></p>
    <div class="modal-actions">
      <button class="modal-btn" id="ns-cancel">Cancel</button>
      <button class="modal-btn confirm" id="ns-submit">Create</button>
    </div>
  </div>
</div>`;
}

/** Inline JS IIFE for the new session modal. */
export function newSessionModalScript(): string {
	return `(function() {
  const modal = document.getElementById('new-session-modal');
  const openBtn = document.getElementById('new-session-btn');
  const cancelBtn = document.getElementById('ns-cancel');
  const submitBtn = document.getElementById('ns-submit');
  const nameInput = document.getElementById('ns-name');
  const dirInput = document.getElementById('ns-dir');
  const dirList = document.getElementById('ns-dir-list');
  const errorEl = document.getElementById('ns-error');

  function openModal() {
    modal.classList.add('open');
    nameInput.value = '';
    dirInput.value = '';
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    dirList.innerHTML = '';
    setTimeout(() => nameInput.focus(), 50);
  }

  function closeModal() { modal.classList.remove('open'); }

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  let debounceTimer = null;
  dirInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = dirInput.value.trim();
    if (!val) { dirList.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/fs/list?path=' + encodeURIComponent(val));
        const data = await res.json();
        dirList.innerHTML = '';
        for (const d of (data.dirs || [])) {
          const opt = document.createElement('option');
          opt.value = d;
          dirList.appendChild(opt);
        }
      } catch {}
    }, 200);
  });

  async function submit() {
    const name = nameInput.value.trim();
    const dir = dirInput.value.trim();
    if (!name) { showError('Session name is required.'); nameInput.focus(); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    errorEl.style.display = 'none';
    try {
      const res = await fetch('/api/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dir: dir || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Failed to create session.'); return; }
      window.location.href = '/s/' + encodeURIComponent(name);
    } catch { showError('Network error. Please try again.'); }
    finally { submitBtn.disabled = false; submitBtn.textContent = 'Create'; }
  }

  function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }

  submitBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dirInput.focus(); });
  dirInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
})();`;
}
