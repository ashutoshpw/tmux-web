export type CommandbarSession = {
	name: string;
	windows: number;
	attached: boolean;
	lastAccessedAt?: number;
};

export type CommandbarAction = {
	label: string;
	meta: string;
	clickTargetId: string;
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
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(0,0,0,0.16); color: var(--panel-muted);
    border: 1px solid var(--panel-border); border-radius: 6px;
    cursor: pointer; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    font-size: 11px; line-height: 1; padding: 6px 8px;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .cmdbar-btn:hover,
  .cmdbar-btn:focus-visible {
    color: var(--panel-accent); border-color: rgba(125, 211, 252, 0.35);
    outline: none; background: rgba(125, 211, 252, 0.08);
  }
  .cmdbar-btn svg { width: 14px; height: 14px; fill: currentColor; flex: 0 0 auto; }
  .cmdbar-shortcut {
    color: var(--panel-muted); border: 1px solid rgba(148, 163, 184, 0.22);
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
    .cmdbar-shortcut { display: none; }
    .cmdbar-row { align-items: flex-start; flex-direction: column; gap: 4px; }
    .cmdbar-row-meta { text-align: left; }
  }`;
}

export function commandbarButtonHTML(label = 'Sessions'): string {
	return `<button class="cmdbar-btn" id="cmdbar-open" title="Open command bar">
    <svg viewBox="0 0 24 24"><path d="M9.5 3a6.5 6.5 0 0 1 5.18 10.43l4.45 4.44-1.42 1.42-4.44-4.45A6.5 6.5 0 1 1 9.5 3Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>
    <span>${label}</span>
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
    <span>Enter opens · Esc closes</span>
  </div>
</div>`;
}

export function commandbarScript(sessions: CommandbarSession[], actions: CommandbarAction[] = []): string {
	const sessionsJson = JSON.stringify(sessions).replace(/</g, '\\u003c');
	const actionsJson = JSON.stringify(actions).replace(/</g, '\\u003c');
	return `
(function() {
  const initialSessions = ${sessionsJson};
  const actions = ${actionsJson}.map((action) => ({ ...action, kind: 'action' }));
  let sessions = initialSessions;
  let visible = [];
  let activeIndex = 0;

  const openBtn = document.getElementById('cmdbar-open');
  const backdrop = document.getElementById('cmdbar-backdrop');
  const panel = document.getElementById('cmdbar-panel');
  const input = document.getElementById('cmdbar-input');
  const list = document.getElementById('cmdbar-list');
  const count = document.getElementById('cmdbar-count');
  if (!openBtn || !backdrop || !panel || !input || !list || !count) return;

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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function selectSession(session) {
    window.location.href = '/s/' + encodeURIComponent(session.name);
  }

  function selectItem(item) {
    if (item.kind === 'action') {
      setOpen(false);
      document.getElementById(item.clickTargetId)?.click();
      return;
    }
    selectSession(item);
  }

  function render() {
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

  function setOpen(nextOpen) {
    panel.classList.toggle('open', nextOpen);
    backdrop.classList.toggle('open', nextOpen);
    if (nextOpen) {
      input.value = '';
      activeIndex = 0;
      render();
      setTimeout(() => input.focus(), 0);
      refreshSessions();
    } else {
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
    activeIndex = 0;
    render();
  });
  list.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest('.cmdbar-row') : null;
    if (!row) return;
    const item = visible[Number(row.dataset.index)];
    if (item) selectItem(item);
  });
  list.addEventListener('mousemove', (event) => {
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
    if (!panel.classList.contains('open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
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
      if (item) selectItem(item);
    }
  }, true);

  render();
}());`;
}
