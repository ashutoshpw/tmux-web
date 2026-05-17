import { Router, type Request, type Response } from 'express';
import { parseWorkflowUrl } from './workflows.js';

export const dispatchRouter = Router();

const GH_BASE = 'https://api.github.com';

function ghHeaders() {
  return {
    Authorization:          `Bearer ${process.env.GITHUB_PAT}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent':           'tmux-web-github-actions-ext/0.1',
  };
}

// ─── POST /dispatch ──────────────────────────────────────────────────────────
//
// Trigger a workflow_dispatch event.
// Body: { url: string, ref: string }  — url is the full GitHub Actions workflow URL

dispatchRouter.post('/dispatch', async (req: Request, res: Response) => {
  const { url, ref } = req.body as Record<string, string>;

  if (!url || !ref) {
    res.status(400).json({ error: '`url` and `ref` are required' });
    return;
  }

  const parsed = parseWorkflowUrl(url);
  if (!parsed) { res.status(400).json({ error: 'Invalid GitHub Actions workflow URL' }); return; }
  const { repo, workflow } = parsed;

  const ghRes = await fetch(
    `${GH_BASE}/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    },
  );

  // GitHub returns 204 No Content on success
  if (ghRes.status === 204) {
    res.json({ ok: true });
    return;
  }

  const body = await ghRes.json().catch(() => ({}));
  res.status(ghRes.status).json(body);
});
