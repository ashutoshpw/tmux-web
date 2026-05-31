import { createExtension } from '@tmux-web/ext-sdk';

interface WorkflowRun {
  id: number;
  name: string;
  display_title: string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  status: 'queued' | 'in_progress' | 'waiting' | 'completed';
  html_url: string;
  head_branch: string;
  run_started_at: string;
  updated_at: string;
}

interface RunsResponse {
  workflow_runs: WorkflowRun[];
}

interface Config {
  pollIntervalMs?: number;
}

const ext = createExtension();

let _session   = '';
let _pollTimer = 0;

// ─── Status maps ──────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
  success:     '✓',
  failure:     '✗',
  cancelled:   '○',
  skipped:     '—',
  timed_out:   '⏱',
  in_progress: '⟳',
  queued:      '…',
  waiting:     '⏸',
};

const STATUS_COLOR: Record<string, string> = {
  success:     '#73c991',
  failure:     '#f14c4c',
  cancelled:   '#888',
  skipped:     '#888',
  timed_out:   '#e9c46a',
  in_progress: '#e9c46a',
  queued:      '#888',
  waiting:     '#888',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeHref(url: string): string {
  return url.startsWith('https://github.com/') ? esc(url) : '#';
}

function stateKey(run: WorkflowRun): string {
  return run.status === 'completed' ? (run.conclusion ?? 'unknown') : run.status;
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return 'just now';
}

function labelFromUrl(url: string): string {
  const file = url.match(/\/actions\/workflows\/([^/?#]+)/)?.[1]?.replace(/\.(yml|yaml)$/, '') ?? url;
  const repo = url.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? '';
  return repo ? `${repo} / ${file}` : file;
}

// ─── Row rendering ────────────────────────────────────────────────────────────

function renderRow(url: string, index: number, run: WorkflowRun | null, error?: string): string {
  const label   = esc(labelFromUrl(url));
  const idxAttr = index;

  if (error) {
    return `<div class="wf-row" id="wf-row-${idxAttr}">
      <span class="wf-icon" style="color:#f14c4c">!</span>
      <div class="wf-body">
        <div class="wf-name">${label}</div>
        <div class="wf-meta" style="color:#f14c4c">${esc(error)}</div>
      </div>
      <button class="wf-remove" onclick="removeWorkflow(${idxAttr})" title="Remove">×</button>
    </div>`;
  }

  if (!run) {
    return `<div class="wf-row" id="wf-row-${idxAttr}">
      <span class="wf-icon wf-spin" style="color:#888">⟳</span>
      <div class="wf-body">
        <div class="wf-name">${label}</div>
        <div class="wf-meta">loading…</div>
      </div>
      <button class="wf-remove" onclick="removeWorkflow(${idxAttr})" title="Remove">×</button>
    </div>`;
  }

  const key        = stateKey(run);
  const color      = STATUS_COLOR[key] ?? '#888';
  const icon       = STATUS_ICON[key]  ?? '?';
  const spin       = key === 'in_progress' ? ' wf-spin' : '';
  const branch     = esc(run.head_branch);
  const when       = esc(relativeTime(run.updated_at));
  const ghHref     = safeHref(run.html_url);
  const urlEncoded = esc(JSON.stringify(url));

  return `<div class="wf-row" id="wf-row-${idxAttr}">
    <span class="wf-icon${spin}" style="color:${color}">${icon}</span>
    <div class="wf-body">
      <div class="wf-name">${label}</div>
      <div class="wf-meta">${branch} · ${when}</div>
    </div>
    <div class="wf-actions">
      <a class="wf-link" href="${ghHref}" target="_blank" rel="noopener" title="Open in GitHub">↗</a>
      <button class="wf-btn" onclick="rerunWorkflow(${urlEncoded})" title="Re-run">▶</button>
      <button class="wf-remove" onclick="removeWorkflow(${idxAttr})" title="Remove">×</button>
    </div>
  </div>`;
}

// ─── Data & render cycle ──────────────────────────────────────────────────────

async function fetchRun(url: string): Promise<WorkflowRun | null> {
  const data = await ext.request<RunsResponse>(`/runs?url=${encodeURIComponent(url)}&perPage=1`);
  return data.workflow_runs?.[0] ?? null;
}

async function loadAndRender() {
  if (!_session) return;

  const urls = await ext.request<string[]>(`/workflows?session=${encodeURIComponent(_session)}`);

  const runsEl    = document.getElementById('runs')!;
  const emptyEl   = document.getElementById('empty-state')!;
  const loadingEl = document.getElementById('loading')!;

  loadingEl.style.display = 'none';

  if (urls.length === 0) {
    runsEl.textContent    = '';
    emptyEl.style.display = 'block';
    ext.resize(document.body.scrollHeight + 16);
    return;
  }

  emptyEl.style.display = 'none';
  runsEl.style.display  = 'block';

  // Paint skeleton rows immediately — safe: renderRow only outputs escaped content
  runsEl.innerHTML = urls.map((url, i) => renderRow(url, i, null)).join('');
  ext.resize(document.body.scrollHeight + 16);

  await Promise.all(urls.map(async (url, i) => {
    try {
      const run = await fetchRun(url);
      const el  = document.getElementById(`wf-row-${i}`);
      if (el) el.outerHTML = renderRow(url, i, run);
    } catch {
      const el = document.getElementById(`wf-row-${i}`);
      if (el) el.outerHTML = renderRow(url, i, null, 'fetch failed');
    }
  }));

  ext.resize(document.body.scrollHeight + 16);
  (window as any).updateTimestamp?.();
}

// ─── Global handlers (called from inline HTML onclick attrs) ─────────────────

(window as any).__refresh = loadAndRender;

(window as any).removeWorkflow = async (index: number) => {
  await ext.request(`/workflows?session=${encodeURIComponent(_session)}&index=${index}`, {
    method: 'DELETE',
  });
  await loadAndRender();
};

(window as any).rerunWorkflow = async (url: string) => {
  try {
    await ext.request('/dispatch', { method: 'POST', body: { url, ref: 'main' } });
    setTimeout(loadAndRender, 3_000);
  } catch (e) {
    console.error('[github-actions] rerun failed:', e);
  }
};

(window as any).addWorkflow = async () => {
  const input = document.getElementById('wf-input') as HTMLInputElement;
  const errEl = document.getElementById('wf-input-err')!;
  const url   = input.value.trim();
  if (!url) return;
  errEl.textContent = '';

  try {
    await ext.request('/workflows', { method: 'POST', body: { session: _session, url } });
    input.value = '';
    await loadAndRender();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    errEl.textContent = msg.includes('400') ? 'Not a valid GitHub Actions workflow URL' : `Error: ${msg}`;
  }
};

// Allow pressing Enter in the input to add
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('wf-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (window as any).addWorkflow();
  });
});

// ─── SDK entry points ─────────────────────────────────────────────────────────

ext.onContext(async ctx => {
  _session = ctx.session;
  const el = document.getElementById('session-label');
  if (el) el.textContent = ctx.session;
  await loadAndRender();
});

ext.onConfig((rawCfg) => {
  const cfg = rawCfg as Config;
  clearInterval(_pollTimer);
  _pollTimer = setInterval(loadAndRender, cfg.pollIntervalMs ?? 60_000) as unknown as number;
});

ext.ready();
