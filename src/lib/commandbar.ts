export type CommandbarSession = {
	name: string;
	windows: number;
	attached: boolean;
	lastAccessedAt?: number;
};

export type CommandbarAction = {
	label: string;
	meta: string;
	/** Click this element id on select (e.g. open a drawer). */
	clickTargetId?: string;
	/** Or navigate to this URL on select. Takes precedence over clickTargetId. */
	href?: string;
	/** Drill into an inline subview on Right Arrow (e.g. windows list). */
	subView?: 'windows';
};

export type CommandbarContext = {
	sessionName?: string;
};

export function buildCommandbarSessions(
	sessions: Array<{ name: string; windows: number; attached: boolean }>,
	accessMap: Map<string, number>,
): CommandbarSession[] {
	return sessions
		.map((session) => ({
			...session,
			lastAccessedAt: accessMap.get(session.name),
		}))
		.sort((a, b) => {
			const ar = a.lastAccessedAt ?? 0;
			const br = b.lastAccessedAt ?? 0;
			if (ar !== br) return br - ar;
			return a.name.localeCompare(b.name);
		});
}

export function commandbarCSS(): string {
	return `
  .cmdbar-btn {
    display: inline-flex; align-items: center;
    background: none; color: var(--panel-muted);
    border: none; padding: 0;
    cursor: pointer; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    line-height: 1;
    transition: color 0.15s;
  }
  .cmdbar-btn:hover,
  .cmdbar-btn:focus-visible {
    color: var(--panel-accent); outline: none;
  }
  .cmdbar-shortcut {
    color: inherit; border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 4px; padding: 2px 4px; font-size: 10px;
  }
  .cmdbar-backdrop {
    position: fixed; inset: 0; z-index: 1400; background: rgba(2, 6, 12, 0.62);
    opacity: 0; pointer-events: none; transition: opacity 0.14s ease;
  }
  .cmdbar-backdrop.open { opacity: 1; pointer-events: auto; }
  .cmdbar-panel {
    position: fixed; left: 50%; top: 72px; z-index: 1401;
    width: min(620px, calc(100vw - 28px)); max-height: min(560px, calc(100vh - 96px));
    transform: translate(-50%, -8px) scale(0.985); opacity: 0; pointer-events: none;
    background: var(--panel-bg);
    background: color-mix(in srgb, var(--panel-bg) 94%, black);
    border: 1px solid rgba(125, 211, 252, 0.22); border-radius: 8px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
    overflow: hidden; transition: opacity 0.14s ease, transform 0.14s ease;
    font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
  }
  .cmdbar-panel.open { opacity: 1; pointer-events: auto; transform: translate(-50%, 0) scale(1); }
  .cmdbar-search {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; border-bottom: 1px solid var(--panel-border);
  }
  .cmdbar-search svg { width: 16px; height: 16px; fill: var(--panel-muted); flex: 0 0 auto; }
  .cmdbar-search input {
    width: 100%; min-width: 0; border: 0; outline: 0; background: transparent;
    color: var(--page-fg); font: inherit; font-size: 14px;
  }
  .cmdbar-search input::placeholder { color: var(--panel-muted); }
  .cmdbar-list {
    max-height: 428px; overflow: auto; padding: 8px;
  }
  .cmdbar-row {
    display: flex; justify-content: space-between; align-items: center; gap: 14px;
    width: 100%; padding: 10px 12px; border: 1px solid transparent; border-radius: 6px;
    background: transparent; color: var(--page-fg); cursor: pointer; text-align: left;
    font: inherit;
  }
  .cmdbar-row-action .cmdbar-row-name { color: var(--panel-success); }
  .cmdbar-row:hover,
  .cmdbar-row.active {
    border-color: rgba(125, 211, 252, 0.28); background: rgba(125, 211, 252, 0.08);
  }
  .cmdbar-row-name {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--panel-accent); font-size: 13px;
  }
  .cmdbar-row-meta {
    flex: 0 0 auto; color: var(--panel-muted); font-size: 11px; text-align: right;
  }
  .cmdbar-row-meta-current { color: var(--panel-success); text-transform: uppercase; letter-spacing: 0.06em; }
  .cmdbar-rename-input {
    width: 100%; min-width: 0; border: 1px solid rgba(125, 211, 252, 0.35);
    border-radius: 4px; padding: 4px 6px; background: rgba(0, 0, 0, 0.25);
    color: var(--page-fg); font: inherit; font-size: 13px; outline: none;
  }
  .cmdbar-rename-input:focus { border-color: var(--panel-accent); }
  .cmdbar-empty {
    padding: 28px 16px; text-align: center; color: var(--panel-muted); font-size: 12px;
  }
  .cmdbar-footer {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 8px 12px; border-top: 1px solid var(--panel-border);
    color: var(--panel-muted); font-size: 10px;
  }
  @media (max-width: 560px) {
    .cmdbar-panel { top: 54px; width: calc(100vw - 16px); max-height: calc(100vh - 70px); }
    .cmdbar-row { align-items: flex-start; flex-direction: column; gap: 4px; }
    .cmdbar-row-meta { text-align: left; }
  }`;
}

export function commandbarButtonHTML(label = 'Sessions'): string {
	return `<button class="cmdbar-btn" id="cmdbar-open" title="${label} (⌘K)" aria-label="${label} (⌘K)">
    <span class="cmdbar-shortcut">⌘K</span>
  </button>`;
}

export function commandbarHTML(): string {
	return `
<div class="cmdbar-backdrop" id="cmdbar-backdrop"></div>
<div class="cmdbar-panel" id="cmdbar-panel" role="dialog" aria-modal="true" aria-label="Switch tmux session">
  <div class="cmdbar-search">
    <svg viewBox="0 0 24 24"><path d="M9.5 3a6.5 6.5 0 0 1 5.18 10.43l4.45 4.44-1.42 1.42-4.44-4.45A6.5 6.5 0 1 1 9.5 3Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>
    <input id="cmdbar-input" type="search" placeholder="Filter tmux sessions" autocomplete="off" spellcheck="false" />
  </div>
  <div class="cmdbar-list" id="cmdbar-list"></div>
  <div class="cmdbar-footer">
    <span id="cmdbar-count">Recent sessions</span>
    <span id="cmdbar-hint">Enter opens · Esc closes</span>
  </div>
</div>`;
}

export function commandbarScript(
	sessions: CommandbarSession[],
	actions: CommandbarAction[] = [],
	context: CommandbarContext = {},
): string {
	const sessionsJson = JSON.stringify(sessions).replace(/</g, '\\u003c');
	const actionsJson = JSON.stringify(actions).replace(/</g, '\\u003c');
	const sessionNameJson = JSON.stringify(context.sessionName ?? null).replace(/</g, '\\u003c');
	return `
(function() {
  const initialSessions = ${sessionsJson};
  const actions = ${actionsJson}.map((action) => ({ ...action, kind: 'action' }));
  const sessionName = ${sessionNameJson};
  let sessions = initialSessions;
  let visible = [];
  let activeIndex = 0;
  let view = 'root';
  let windows = [];
  let renaming = false;

  const ROOT_PLACEHOLDER = 'Filter tmux sessions';
  const WINDOWS_PLACEHOLDER = 'Filter windows';

  const openBtn = document.getElementById('cmdbar-open');
  const backdrop = document.getElementById('cmdbar-backdrop');
  const panel = document.getElementById('cmdbar-panel');
  const input = document.getElementById('cmdbar-input');
  const list = document.getElementById('cmdbar-list');
  const count = document.getElementById('cmdbar-count');
  const hint = document.getElementById('cmdbar-hint');
  if (!openBtn || !backdrop || !panel || !input || !list || !count || !hint) return;

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

  function sessionMeta(session) {
    const parts = [
      session.windows + ' window' + (session.windows === 1 ? '' : 's'),
    ];
    if (session.attached) parts.push('attached');
    const recent = relativeTime(session.lastAccessedAt);
    if (recent) parts.push(recent);
    return parts.join(' · ');
  }

  function windowDisplayName(win) {
    return win.label || win.name;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateChrome() {
    if (view === 'windows') {
      input.placeholder = WINDOWS_PLACEHOLDER;
      hint.textContent = 'Enter switches · r renames · ← back · Esc closes';
    } else {
      input.placeholder = ROOT_PLACEHOLDER;
      hint.textContent = 'Enter opens · Esc closes';
    }
  }

  function selectSession(session) {
    window.location.href = '/s/' + encodeURIComponent(session.name);
  }

  function selectItem(item) {
    if (item.kind === 'action') {
      if (item.subView === 'windows' && sessionName) {
        void enterWindowsView();
        return;
      }
      setOpen(false);
      if (item.href) {
        window.location.href = item.href;
        return;
      }
      if (item.clickTargetId) document.getElementById(item.clickTargetId)?.click();
      return;
    }
    selectSession(item);
  }

  function renderRoot() {
    const query = input.value.trim().toLowerCase();
    const actionMatches = actions.filter((action) => (
      action.label.toLowerCase().includes(query) || action.meta.toLowerCase().includes(query)
    ));
    const sessionMatches = query
      ? sessions.filter((session) => session.name.toLowerCase().includes(query))
      : sessions.slice(0, 5);
    visible = query ? [...actionMatches, ...sessionMatches] : [...actions, ...sessionMatches];
    activeIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));
    count.textContent = query
      ? visible.length + ' result' + (visible.length === 1 ? '' : 's')
      : 'Actions · Recent sessions';

    if (!visible.length) {
      list.innerHTML = '<div class="cmdbar-empty">No sessions found</div>';
      return;
    }

    list.innerHTML = visible.map((item, index) => (
      '<button class="cmdbar-row' + (item.kind === 'action' ? ' cmdbar-row-action' : '') + (index === activeIndex ? ' active' : '') + '" data-index="' + index + '">' +
        '<span class="cmdbar-row-name">' + escapeHtml(item.kind === 'action' ? item.label : item.name) + '</span>' +
        '<span class="cmdbar-row-meta">' + escapeHtml(item.kind === 'action' ? item.meta : sessionMeta(item)) + '</span>' +
      '</button>'
    )).join('');
  }

  function renderWindows() {
    const query = input.value.trim().toLowerCase();
    visible = query
      ? windows.filter((win) => {
          const label = (win.label || '').toLowerCase();
          const name = win.name.toLowerCase();
          return label.includes(query) || name.includes(query) || String(win.index).includes(query);
        })
      : windows.slice();
    activeIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));
    count.textContent = query
      ? visible.length + ' window' + (visible.length === 1 ? '' : 's')
      : 'Switch window';

    if (!visible.length) {
      list.innerHTML = '<div class="cmdbar-empty">' + (windows.length ? 'No windows found' : 'No windows in this session') + '</div>';
      return;
    }

    list.innerHTML = visible.map((win, index) => {
      const metaClass = win.active ? ' cmdbar-row-meta-current' : '';
      const meta = win.active ? 'current' : String(win.index);
      return (
        '<button class="cmdbar-row' + (index === activeIndex ? ' active' : '') + '" data-index="' + index + '">' +
          '<span class="cmdbar-row-name">' + escapeHtml(windowDisplayName(win)) + '</span>' +
          '<span class="cmdbar-row-meta' + metaClass + '">' + escapeHtml(meta) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function render() {
    updateChrome();
    if (view === 'windows') renderWindows();
    else renderRoot();
  }

  async function fetchWindows() {
    if (!sessionName) return [];
    try {
      const res = await fetch('/api/session/' + encodeURIComponent(sessionName) + '/windows');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async function enterWindowsView() {
    if (!sessionName) return;
    windows = await fetchWindows();
    view = 'windows';
    input.value = '';
    activeIndex = 0;
    render();
    setTimeout(() => input.focus(), 0);
  }

  function exitWindowsView() {
    view = 'root';
    input.value = '';
    activeIndex = 0;
    render();
    setTimeout(() => input.focus(), 0);
  }

  async function selectWindow(win) {
    if (!sessionName || !win || win.active) return;
    try {
      const res = await fetch(
        '/api/session/' + encodeURIComponent(sessionName) + '/select-window',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowIndex: win.index }),
        },
      );
      if (!res.ok) return;
      setOpen(false);
    } catch {}
  }

  function startWindowRename(win) {
    if (!sessionName || !win || renaming) return;
    renaming = true;
    const row = list.querySelector('.cmdbar-row.active');
    if (!row) {
      renaming = false;
      return;
    }
    const nameEl = row.querySelector('.cmdbar-row-name');
    if (!nameEl) {
      renaming = false;
      return;
    }

    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'cmdbar-rename-input';
    editInput.value = win.label || win.name || '';
    editInput.placeholder = win.name || '';
    editInput.addEventListener('click', (event) => event.stopPropagation());

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      renaming = false;
      if (save) {
        try {
          const res = await fetch(
            '/api/session/' + encodeURIComponent(sessionName) + '/window-label',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ windowIndex: win.index, label: editInput.value }),
            },
          );
          if (res.ok) {
            const trimmed = editInput.value.trim();
            win.label = trimmed || null;
            const stored = windows.find((entry) => entry.index === win.index);
            if (stored) stored.label = win.label;
          }
        } catch {}
      }
      render();
    };

    editInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); void finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); void finish(false); }
    });
    editInput.addEventListener('blur', () => { void finish(true); });

    nameEl.replaceWith(editInput);
    editInput.focus();
    editInput.select();
  }

  function setOpen(nextOpen) {
    panel.classList.toggle('open', nextOpen);
    backdrop.classList.toggle('open', nextOpen);
    if (nextOpen) {
      view = 'root';
      renaming = false;
      input.value = '';
      activeIndex = 0;
      render();
      setTimeout(() => input.focus(), 0);
      refreshSessions();
    } else {
      view = 'root';
      renaming = false;
      openBtn.focus();
    }
  }

  async function refreshSessions() {
    try {
      const res = await fetch('/api/sessions', { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      sessions = await res.json();
      render();
    } catch {}
  }

  openBtn.addEventListener('click', () => setOpen(true));
  backdrop.addEventListener('click', () => setOpen(false));
  input.addEventListener('input', () => {
    if (renaming) return;
    activeIndex = 0;
    render();
  });
  list.addEventListener('click', (event) => {
    if (renaming) return;
    const row = event.target instanceof Element ? event.target.closest('.cmdbar-row') : null;
    if (!row) return;
    const item = visible[Number(row.dataset.index)];
    if (!item) return;
    if (view === 'windows') void selectWindow(item);
    else selectItem(item);
  });
  list.addEventListener('mousemove', (event) => {
    if (renaming) return;
    const row = event.target instanceof Element ? event.target.closest('.cmdbar-row') : null;
    if (!row) return;
    activeIndex = Number(row.dataset.index);
    render();
  });

  document.addEventListener('keydown', (event) => {
    const isShortcut = event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'k';
    if (isShortcut) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!panel.classList.contains('open'));
      return;
    }
    if (!panel.classList.contains('open') || renaming) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (view === 'windows') exitWindowsView();
      else setOpen(false);
      return;
    }
    if (event.key === 'ArrowLeft') {
      if (view === 'windows') {
        event.preventDefault();
        exitWindowsView();
      }
      return;
    }
    if (event.key === 'ArrowRight') {
      if (view === 'root') {
        const item = visible[activeIndex];
        if (item && item.kind === 'action' && item.subView === 'windows' && sessionName) {
          event.preventDefault();
          void enterWindowsView();
        }
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, visible.length - 1);
      render();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = visible[activeIndex];
      if (!item) return;
      if (view === 'windows') void selectWindow(item);
      else selectItem(item);
      return;
    }
    if (view === 'windows' && !event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'r') {
      event.preventDefault();
      const item = visible[activeIndex];
      if (item) startWindowRename(item);
    }
  }, true);

  render();
}());`;
}
