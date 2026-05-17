/**
 * extensions/github-actions/backend/routes/runs.ts
 *
 * All workflow-run related routes, split out of index.ts for clarity.
 * Mount with: app.use(runsRouter)
 */

import { Router, type Request, type Response } from 'express';
import { parseWorkflowUrl } from './workflows.js';

export const runsRouter = Router();

const GH_BASE = 'https://api.github.com';

function ghHeaders() {
  return {
    Authorization:          `Bearer ${process.env.GITHUB_PAT}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent':           'tmux-web-github-actions-ext/0.1',
  };
}

async function ghFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${GH_BASE}${path}`, {
    ...options,
    headers: { ...ghHeaders(), ...(options?.headers ?? {}) },
  });
  const body = res.status === 204 ? null : await res.json();
  return { status: res.status, body };
}

// ─── GET /runs ────────────────────────────────────────────────────────────────
//
// Query params (provide one of):
//   url       — full GitHub Actions workflow URL (preferred)
//   repo + workflow — "owner/repo" and "ci.yml"
//
// Optional:
//   perPage   — number of runs to return  (default 5, max 10)
//   branch    — filter by branch
//
// Returns: { total_count, workflow_runs: WorkflowRun[] }

runsRouter.get('/runs', async (req: Request, res: Response) => {
  let { url, repo, workflow, perPage = '5', branch } = req.query as Record<string, string>;

  if (url) {
    const parsed = parseWorkflowUrl(url);
    if (!parsed) { res.status(400).json({ error: 'Invalid GitHub Actions workflow URL' }); return; }
    repo     = parsed.repo;
    workflow = parsed.workflow;
  }

  if (!repo || !workflow) {
    res.status(400).json({ error: 'Provide `url` or both `repo` and `workflow`' });
    return;
  }

  const clampedPerPage = Math.min(Number(perPage), 10);

  const params = new URLSearchParams({
    per_page: String(clampedPerPage),
    ...(branch ? { branch } : {}),
  });

  const { status, body } = await ghFetch(
    `/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?${params}`,
  );

  res.status(status).json(body);
});

// ─── GET /runs/:runId ────────────────────────────────────────────────────────
//
// Fetch a single run by id — used to poll in-progress runs.
//
// Query params:
//   repo — "owner/repo" (required)

runsRouter.get('/runs/:runId', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const { repo } = req.query as Record<string, string>;

  if (!repo) {
    res.status(400).json({ error: '`repo` is required' });
    return;
  }

  const { status, body } = await ghFetch(`/repos/${repo}/actions/runs/${runId}`);
  res.status(status).json(body);
});

// ─── GET /runs/:runId/jobs ───────────────────────────────────────────────────
//
// Fetch the jobs for a specific run (steps, conclusions, log links).

runsRouter.get('/runs/:runId/jobs', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const { repo } = req.query as Record<string, string>;

  if (!repo) {
    res.status(400).json({ error: '`repo` is required' });
    return;
  }

  const { status, body } = await ghFetch(
    `/repos/${repo}/actions/runs/${runId}/jobs?filter=latest`,
  );
  res.status(status).json(body);
});

// ─── POST /runs/:runId/rerun ─────────────────────────────────────────────────
//
// Re-run a specific run (all jobs).
// Body: { repo: string }

runsRouter.post('/runs/:runId/rerun', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const { repo } = req.body as Record<string, string>;

  if (!repo) {
    res.status(400).json({ error: '`repo` is required in body' });
    return;
  }

  const { status, body } = await ghFetch(
    `/repos/${repo}/actions/runs/${runId}/rerun`,
    { method: 'POST' },
  );

  res.status(status === 201 ? 200 : status).json(
    status === 201 ? { ok: true, runId } : body,
  );
});

// ─── POST /runs/:runId/rerun-failed ─────────────────────────────────────────
//
// Re-run only the failed jobs in a run.

runsRouter.post('/runs/:runId/rerun-failed', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const { repo } = req.body as Record<string, string>;

  if (!repo) {
    res.status(400).json({ error: '`repo` is required in body' });
    return;
  }

  const { status, body } = await ghFetch(
    `/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
    { method: 'POST' },
  );

  res.status(status === 201 ? 200 : status).json(
    status === 201 ? { ok: true, runId } : body,
  );
});

// ─── DELETE /runs/:runId ─────────────────────────────────────────────────────
//
// Cancel a run that's currently queued or in_progress.

runsRouter.delete('/runs/:runId', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const { repo } = req.query as Record<string, string>;

  if (!repo) {
    res.status(400).json({ error: '`repo` is required' });
    return;
  }

  const { status, body } = await ghFetch(
    `/repos/${repo}/actions/runs/${runId}/cancel`,
    { method: 'POST' }, // GitHub uses POST for cancel
  );

  res.status(status === 202 ? 200 : status).json(
    status === 202 ? { ok: true, runId } : body,
  );
});