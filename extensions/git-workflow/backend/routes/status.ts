import { Hono } from 'hono';
import { fetchSessionStatus } from '../status-service.js';

export const statusRouter = new Hono();

statusRouter.get('/status', async (c) => {
  const session = c.req.query('session');
  if (!session) return c.json({ error: 'session is required' }, 400);

  const result = await fetchSessionStatus(session);
  return c.json(result);
});
