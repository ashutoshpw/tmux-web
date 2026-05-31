import { Hono } from 'hono';
import { ghApi } from '@tmux-web/ext-gh-workflow';
import { parseWorkflowUrl } from './workflows.js';

export const dispatchRouter = new Hono();

// ─── POST /dispatch ──────────────────────────────────────────────────────────
// Trigger a workflow_dispatch event.
// Body: { url: string, ref: string }
dispatchRouter.post('/dispatch', async (c) => {
  const { url, ref } = await c.req.json<{ url?: string; ref?: string }>();

  if (!url || !ref) return c.json({ error: '`url` and `ref` are required' }, 400);

  const parsed = parseWorkflowUrl(url);
  if (!parsed) return c.json({ error: 'Invalid GitHub Actions workflow URL' }, 400);
  const { repo, workflow } = parsed;

  const { status, body } = await ghApi(
    `repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    { method: 'POST', body: { ref } },
  );

  if (status === 204) return c.json({ ok: true });
  return c.json(body, status as any);
});
