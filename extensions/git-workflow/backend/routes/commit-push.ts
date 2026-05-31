import { Hono } from 'hono';
import { commitAll, getGitStatus, push, repoRoot } from '../git.js';
import { getActivePaneInfo } from '../tmux.js';
import { fetchSessionStatus } from '../status-service.js';

export const commitPushRouter = new Hono();

commitPushRouter.post('/commit-push', async (c) => {
  const body = await c.req.json<{ session?: string; message?: string }>();
  const session = body.session?.trim();
  const message = body.message?.trim();

  if (!session) return c.json({ error: 'session is required' }, 400);

  const pane = getActivePaneInfo(session);
  if (!pane) return c.json({ error: 'Could not resolve active tmux pane' }, 404);

  const cwd = pane.panePath;
  if (!cwd) return c.json({ error: 'Could not detect pane working directory' }, 400);

  const root = repoRoot(cwd);
  if (!root) return c.json({ error: 'Not a git repository' }, 400);

  const before = getGitStatus(root);

  if (!before.dirty && before.ahead === 0) {
    return c.json({ error: 'Nothing to commit or push' }, 400);
  }

  if (before.dirty) {
    if (!message) return c.json({ error: 'Commit message is required when there are uncommitted changes' }, 400);
    try {
      commitAll(root, message);
    } catch (err) {
      return c.json({ error: `Commit failed: ${(err as Error).message}` }, 500);
    }
  }

  const afterCommit = getGitStatus(root);
  if (afterCommit.ahead > 0) {
    try {
      push(root);
    } catch (err) {
      return c.json({ error: `Push failed: ${(err as Error).message}` }, 500);
    }
  }

  const status = await fetchSessionStatus(session);
  return c.json({ ok: true, status });
});
