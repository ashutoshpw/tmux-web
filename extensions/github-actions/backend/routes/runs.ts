import { Hono } from 'hono';
import { ghApi } from '@tmux-web/ext-gh-workflow';
import { parseWorkflowUrl } from './workflows.js';

export const runsRouter = new Hono();

// ─── GET /runs ────────────────────────────────────────────────────────────────
runsRouter.get('/runs', async (c) => {
  let repo     = c.req.query('repo');
  let workflow = c.req.query('workflow');
  const url    = c.req.query('url');
  const perPage = c.req.query('perPage') ?? '5';
  const branch  = c.req.query('branch');

  if (url) {
    const parsed = parseWorkflowUrl(url);
    if (!parsed) return c.json({ error: 'Invalid GitHub Actions workflow URL' }, 400);
    repo     = parsed.repo;
    workflow = parsed.workflow;
  }

  if (!repo || !workflow) {
    return c.json({ error: 'Provide `url` or both `repo` and `workflow`' }, 400);
  }

  const clampedPerPage = Math.min(Number(perPage), 10);
  const params = new URLSearchParams({
    per_page: String(clampedPerPage),
    ...(branch ? { branch } : {}),
  });

  const { status, body } = await ghApi(
    `repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?${params}`,
  );
  return c.json(body, status as any);
});

// ─── GET /runs/:runId ────────────────────────────────────────────────────────
runsRouter.get('/runs/:runId', async (c) => {
  const runId = c.req.param('runId');
  const repo  = c.req.query('repo');

  if (!repo) return c.json({ error: '`repo` is required' }, 400);

  const { status, body } = await ghApi(`repos/${repo}/actions/runs/${runId}`);
  return c.json(body, status as any);
});

// ─── GET /runs/:runId/jobs ───────────────────────────────────────────────────
runsRouter.get('/runs/:runId/jobs', async (c) => {
  const runId = c.req.param('runId');
  const repo  = c.req.query('repo');

  if (!repo) return c.json({ error: '`repo` is required' }, 400);

  const { status, body } = await ghApi(
    `repos/${repo}/actions/runs/${runId}/jobs?filter=latest`,
  );
  return c.json(body, status as any);
});

// ─── POST /runs/:runId/rerun ─────────────────────────────────────────────────
runsRouter.post('/runs/:runId/rerun', async (c) => {
  const runId = c.req.param('runId');
  const { repo } = await c.req.json<{ repo?: string }>();

  if (!repo) return c.json({ error: '`repo` is required in body' }, 400);

  const { status, body } = await ghApi(
    `repos/${repo}/actions/runs/${runId}/rerun`,
    { method: 'POST' },
  );

  if (status === 201) return c.json({ ok: true, runId });
  return c.json(body, status as any);
});

// ─── POST /runs/:runId/rerun-failed ──────────────────────────────────────────
runsRouter.post('/runs/:runId/rerun-failed', async (c) => {
  const runId = c.req.param('runId');
  const { repo } = await c.req.json<{ repo?: string }>();

  if (!repo) return c.json({ error: '`repo` is required in body' }, 400);

  const { status, body } = await ghApi(
    `repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
    { method: 'POST' },
  );

  if (status === 201) return c.json({ ok: true, runId });
  return c.json(body, status as any);
});

// ─── DELETE /runs/:runId ─────────────────────────────────────────────────────
runsRouter.delete('/runs/:runId', async (c) => {
  const runId = c.req.param('runId');
  const repo  = c.req.query('repo');

  if (!repo) return c.json({ error: '`repo` is required' }, 400);

  const { status, body } = await ghApi(
    `repos/${repo}/actions/runs/${runId}/cancel`,
    { method: 'POST' },
  );

  if (status === 202) return c.json({ ok: true, runId });
  return c.json(body, status as any);
});
