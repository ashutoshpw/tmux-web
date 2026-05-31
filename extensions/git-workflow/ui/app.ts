import { createExtension } from '@tmux-web/ext-sdk';

interface PrCheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  url: string;
}

interface PrInfo {
  number: number;
  title: string;
  url: string;
  headSha: string;
  checks: PrCheck[];
}

interface PaneData {
  session: string;
  paneId: string;
  panePath: string;
  windowIndex: number;
  branch: string;
  kind: 'local' | 'worktree';
  mainRepoPath: string | null;
  repoRoot: string;
  github: { nameWithOwner: string; org: string; repo: string };
  changes: { added: number; removed: number };
  dirty: boolean;
  ahead: number;
  behind: number;
  branches: string[];
  paneReady: boolean;
  fetchedAt: number;
  pr?: PrInfo | null;
}

interface StatusResponse {
  isRepo: boolean;
  isGithub: boolean;
  message?: string;
  paneId?: string;
  windowIndex?: number;
  panePath?: string;
  data?: PaneData;
}

interface Config {
  pollIntervalMs?: number;
}

const ext = createExtension();

let _session = '';
let _pollTimer = 0;
let _drawerOpen = false;
let _displayedPaneId = '';
let _currentData: PaneData | null = null;
let _pendingHandoffBranch = '';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setVisible(id: string, show: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  if (show) el.removeAttribute('hidden');
  else el.setAttribute('hidden', '');
}

function updateTimestamp() {
  const el = document.getElementById('last-refresh');
  if (el) el.textContent = 'updated ' + new Date().toLocaleTimeString();
}

function populateBranchSelect(branches: string[], current: string) {
  const sel = document.getElementById('branch-select') as HTMLSelectElement;
  if (!sel) return;
  sel.innerHTML = branches.map((b) =>
    `<option value="${esc(b)}"${b === current ? ' selected' : ''}>${esc(b)}</option>`,
  ).join('');
  if (!branches.length) {
    sel.innerHTML = `<option value="${esc(current)}">${esc(current)}</option>`;
  }
}

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required', 'cancelled']);

function checkStatusClass(check: PrCheck): string {
  if (check.status !== 'completed') return 'pending';
  if (check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped') {
    return check.conclusion === 'skipped' ? 'skipped' : 'passing';
  }
  if (check.conclusion && FAILED_CONCLUSIONS.has(check.conclusion)) return 'failing';
  return 'pending';
}

function checkStatusLabel(check: PrCheck): string {
  if (check.status === 'queued') return 'queued';
  if (check.status === 'in_progress') return 'running';
  return check.conclusion ?? 'unknown';
}

async function sendCheckError(checkUrl: string): Promise<void> {
  try {
    await ext.request('/send-keys', {
      method: 'POST',
      body: {
        session: _session,
        text: `The PR check failed with following error here: ${checkUrl}, do check the root cause for this issue`,
      },
    });
  } catch (e) {
    console.error('[git-workflow] send-keys failed:', e);
  }
}

function renderPrSection(data: PaneData): void {
  const section = document.getElementById('pr-section')!;
  const checksList = document.getElementById('checks-list')!;
  checksList.innerHTML = '';

  if (!data.pr) {
    section.setAttribute('hidden', '');
    return;
  }

  section.removeAttribute('hidden');

  const link = document.getElementById('pr-link') as HTMLAnchorElement;
  link.textContent = `#${data.pr.number}: ${data.pr.title}`;
  link.href = data.pr.url;

  for (const check of data.pr.checks) {
    const cls = checkStatusClass(check);
    const row = document.createElement('div');
    row.className = 'check-row';

    const name = document.createElement('span');
    name.className = 'check-name';
    name.textContent = check.name;
    name.title = check.name;

    const badge = document.createElement('span');
    badge.className = `check-status ${cls}`;
    badge.textContent = checkStatusLabel(check);

    row.appendChild(name);
    row.appendChild(badge);

    if (cls === 'failing') {
      const btn = document.createElement('button');
      btn.className = 'btn danger';
      btn.style.padding = '2px 6px';
      btn.style.fontSize = '10px';
      btn.textContent = '↳ Send';
      btn.title = 'Send failure prompt to active tmux window';
      const url = check.url;
      btn.addEventListener('click', () => { void sendCheckError(url); });
      row.appendChild(btn);
    }

    checksList.appendChild(row);
  }
}

function renderPanel(data: PaneData) {
  _currentData = data;
  _displayedPaneId = data.paneId;

  setVisible('loading', false);
  setVisible('empty-state', false);
  setVisible('panel', true);

  const localBadge = document.getElementById('kind-local')!;
  const worktreeBadge = document.getElementById('kind-worktree')!;
  localBadge.classList.toggle('active', data.kind === 'local');
  worktreeBadge.classList.toggle('active', data.kind === 'worktree');

  const changesEl = document.getElementById('changes')!;
  changesEl.innerHTML = `<span class="add">+${data.changes.added}</span> <span class="del">-${data.changes.removed}</span>`;

  const branchEl = document.getElementById('branch-display')!;
  branchEl.textContent = data.branch;

  const sessionEl = document.getElementById('session-label');
  if (sessionEl) {
    sessionEl.textContent = `${data.session} · win ${data.windowIndex} · ${data.branch}`;
  }

  populateBranchSelect(data.branches, data.branch);

  const pathEl = document.getElementById('path-display')!;
  pathEl.textContent = data.panePath;

  const mainRow = document.getElementById('main-repo-row')!;
  const mainPath = document.getElementById('main-repo-path')!;
  if (data.kind === 'worktree' && data.mainRepoPath) {
    mainRow.style.display = '';
    mainPath.textContent = data.mainRepoPath;
  } else {
    mainRow.style.display = 'none';
    mainPath.textContent = '';
  }

  setVisible('branch-select-row', data.kind === 'local');
  setVisible('local-actions', data.kind === 'local');

  const btn = document.getElementById('commit-push-btn') as HTMLButtonElement;
  btn.disabled = !data.dirty && data.ahead === 0;

  renderPrSection(data);

  ext.resize(document.body.scrollHeight + 16);
}

function renderEmpty(message: string) {
  _currentData = null;
  setVisible('loading', false);
  setVisible('panel', false);
  setVisible('empty-state', true);
  const empty = document.getElementById('empty-state')!;
  empty.innerHTML = esc(message).replace(/\n/g, '<br>');
  ext.resize(document.body.scrollHeight + 16);
}

async function fetchStatus() {
  if (!_session) {
    renderEmpty('Waiting for session context…');
    return;
  }

  try {
    const res = await ext.request<StatusResponse>(
      `/status?session=${encodeURIComponent(_session)}`,
    );

    if (!res.isRepo || !res.isGithub || !res.data) {
      renderEmpty(res.message ?? 'Works with GitHub repositories only');
      return;
    }

    if (_displayedPaneId && res.paneId !== _displayedPaneId) {
      _pendingHandoffBranch = '';
    }

    renderPanel(res.data);
    updateTimestamp();
  } catch (e) {
    console.error('[git-workflow] status failed:', e);
    renderEmpty('Failed to load git status');
  }
}

function stopPoll() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = 0;
  }
}

function startPoll(intervalMs: number) {
  stopPoll();
  _pollTimer = setInterval(() => { void fetchStatus(); }, intervalMs) as unknown as number;
}

function openModal(id: string) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id: string) {
  document.getElementById(id)?.classList.remove('open');
}

async function submitHandoff(confirmCreate = false) {
  const errEl = document.getElementById('handoff-err')!;
  errEl.textContent = '';
  const branch = _pendingHandoffBranch
    || (document.getElementById('handoff-branch') as HTMLInputElement).value.trim();

  if (!branch) {
    errEl.textContent = 'Branch name is required';
    return;
  }

  try {
    await ext.request('/handoff', {
      method: 'POST',
      body: { session: _session, branch, confirmCreate },
    });

    closeModal('handoff-modal');
    closeModal('confirm-modal');
    _pendingHandoffBranch = '';
    await fetchStatus();
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    const jsonStart = msg.indexOf('{');
    if (msg.includes('409') && jsonStart >= 0) {
      try {
        const body = JSON.parse(msg.slice(jsonStart)) as { needsConfirmation?: boolean; branch?: string };
        if (body.needsConfirmation) {
          closeModal('handoff-modal');
          _pendingHandoffBranch = branch;
          const confirmText = document.getElementById('confirm-text')!;
          confirmText.textContent = `Branch "${body.branch ?? branch}" does not exist locally or on origin. Create it and open a worktree?`;
          openModal('confirm-modal');
          return;
        }
      } catch { /* fall through */ }
    }
    errEl.textContent = msg.replace(/^\[ext-sdk\][^:]+:\s*\d+:\s*/, '');
  }
}

async function submitCommitPush() {
  const errEl = document.getElementById('commit-err')!;
  errEl.textContent = '';
  const message = (document.getElementById('commit-message') as HTMLTextAreaElement).value.trim();
  const dirty = _currentData?.dirty ?? false;

  if (dirty && !message) {
    errEl.textContent = 'Commit message is required';
    return;
  }

  try {
    await ext.request('/commit-push', {
      method: 'POST',
      body: { session: _session, message: message || undefined },
    });
    closeModal('commit-modal');
    (document.getElementById('commit-message') as HTMLTextAreaElement).value = '';
    await fetchStatus();
  } catch (e: unknown) {
    errEl.textContent = String((e as Error)?.message ?? e).replace(/^\[ext-sdk\][^:]+:\s*/, '');
  }
}

function wireUi() {
  document.getElementById('handoff-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('branch-select') as HTMLSelectElement;
    const input = document.getElementById('handoff-branch') as HTMLInputElement;
    input.value = sel?.value ?? _currentData?.branch ?? '';
    document.getElementById('handoff-err')!.textContent = '';
    openModal('handoff-modal');
  });

  document.getElementById('handoff-cancel')?.addEventListener('click', () => closeModal('handoff-modal'));
  document.getElementById('handoff-submit')?.addEventListener('click', () => { void submitHandoff(false); });

  document.getElementById('confirm-cancel')?.addEventListener('click', () => {
    closeModal('confirm-modal');
    _pendingHandoffBranch = '';
  });
  document.getElementById('confirm-submit')?.addEventListener('click', () => { void submitHandoff(true); });

  document.getElementById('commit-push-btn')?.addEventListener('click', () => {
    const dirty = _currentData?.dirty ?? false;
    const ahead = _currentData?.ahead ?? 0;
    const title = document.getElementById('commit-title')!;
    const field = document.getElementById('commit-message-field')!;
    const msg = document.getElementById('commit-message') as HTMLTextAreaElement;
    document.getElementById('commit-err')!.textContent = '';

    if (dirty) {
      title.textContent = 'Commit and push';
      field.style.display = '';
      msg.required = true;
    } else if (ahead > 0) {
      title.textContent = 'Push commits';
      field.style.display = 'none';
      msg.required = false;
    }

    openModal('commit-modal');
  });

  document.getElementById('commit-cancel')?.addEventListener('click', () => closeModal('commit-modal'));
  document.getElementById('commit-submit')?.addEventListener('click', () => { void submitCommitPush(); });

  document.getElementById('copy-main-btn')?.addEventListener('click', async () => {
    const path = _currentData?.mainRepoPath;
    if (path) await navigator.clipboard.writeText(path);
  });
}

(window as unknown as { __refresh: () => void }).__refresh = () => { void fetchStatus(); };

ext.onContext((ctx) => {
  _session = ctx.session;
  const el = document.getElementById('session-label');
  if (el) el.textContent = `session: ${ctx.session}`;
  if (_drawerOpen) void fetchStatus();
});

ext.onOpen(() => {
  _drawerOpen = true;
  void fetchStatus();
  const cfg = ext.getConfig() as Config;
  startPoll(cfg?.pollIntervalMs ?? 10_000);
});

ext.onClose(() => {
  _drawerOpen = false;
  stopPoll();
});

ext.onConfig((rawCfg) => {
  const cfg = rawCfg as Config;
  if (_pollTimer) startPoll(cfg.pollIntervalMs ?? 10_000);
});

document.addEventListener('DOMContentLoaded', wireUi);

ext.ready();
