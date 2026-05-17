import { Router, type Request, type Response } from 'express';
import { getWorkflows, addWorkflow, removeWorkflow } from '../storage.js';

export const workflowsRouter = Router();

// Parse https://github.com/{owner}/{repo}/actions/workflows/{file}
export function parseWorkflowUrl(url: string): { repo: string; workflow: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/?#\s]+)/);
  if (!m) return null;
  return { repo: `${m[1]}/${m[2]}`, workflow: m[3] };
}

// GET /workflows?session=xxx
workflowsRouter.get('/workflows', async (req: Request, res: Response) => {
  const { session } = req.query as Record<string, string>;
  if (!session) { res.status(400).json({ error: '`session` is required' }); return; }
  res.json(await getWorkflows(session));
});

// POST /workflows  { session, url }
workflowsRouter.post('/workflows', async (req: Request, res: Response) => {
  const { session, url } = req.body as Record<string, string>;
  if (!session || !url) { res.status(400).json({ error: '`session` and `url` are required' }); return; }
  if (!parseWorkflowUrl(url)) { res.status(400).json({ error: 'Not a valid GitHub Actions workflow URL' }); return; }
  res.json({ urls: await addWorkflow(session, url) });
});

// DELETE /workflows?session=xxx&index=0
workflowsRouter.delete('/workflows', async (req: Request, res: Response) => {
  const { session, index } = req.query as Record<string, string>;
  if (!session || index === undefined) { res.status(400).json({ error: '`session` and `index` are required' }); return; }
  res.json({ urls: await removeWorkflow(session, parseInt(index, 10)) });
});
