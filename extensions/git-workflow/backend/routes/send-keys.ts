import { Hono } from 'hono';
import { getActivePaneInfo, sendKeysToPane, capturePaneTail } from '../tmux.js';
import { isPaneReady } from '../pane-ready.js';

export const sendKeysRouter = new Hono();

sendKeysRouter.post('/send-keys', async (c) => {
  const body = await c.req.json<{ session?: string; text?: string }>();
  const session = body.session?.trim();
  const text = body.text?.trim();

  if (!session || !text) {
    return c.json({ error: 'session and text are required' }, 400);
  }

  const pane = getActivePaneInfo(session);
  if (!pane) return c.json({ error: 'Could not resolve active tmux pane' }, 404);

  const screen = capturePaneTail(pane.target, 20);
  const ready = isPaneReady({
    alternateOn: pane.alternateOn,
    paneCommand: pane.paneCommand,
    paneScreen: screen,
  });

  if (!ready) {
    return c.json({ error: 'Pane is not ready to receive input' }, 409);
  }

  try {
    sendKeysToPane(pane.target, text);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String((err as Error).message) }, 500);
  }
});
