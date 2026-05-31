import { Hono } from 'hono';
import { serve, createAdaptorServer } from '@hono/node-server';
import { unlinkSync } from 'node:fs';
import { statusRouter } from './routes/status.js';
import { handoffRouter } from './routes/handoff.js';
import { commitPushRouter } from './routes/commit-push.js';
import { sendKeysRouter } from './routes/send-keys.js';

const app = new Hono();
app.route('/', statusRouter);
app.route('/', handoffRouter);
app.route('/', commitPushRouter);
app.route('/', sendKeysRouter);

const sockPath = process.env.EXT_SOCKET;

if (sockPath) {
  try { unlinkSync(sockPath); } catch {}
  const server = createAdaptorServer({ fetch: app.fetch });
  server.listen(sockPath, () => console.log(`[git-workflow ext] listening on ${sockPath}`));
} else {
  const port = parseInt(process.env.EXT_PORT ?? '4101', 10);
  serve({ fetch: app.fetch, port }, () => console.log(`[git-workflow ext] running on :${port}`));
}
