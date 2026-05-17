import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { Hono } from 'hono';

export interface ExtManifest {
  id:          string;
  name:        string;
  icon:        string;
  slot:        'sidebar' | 'panel';
  permissions: string[];
  views:       Array<{ entry: string }>;
  backend?:    string;
  start?:      string;
  config:      unknown;
}

export async function loadExtensions(extsDir: string): Promise<ExtManifest[]> {
  if (!existsSync(extsDir)) return [];

  const entries = await readdir(extsDir, { withFileTypes: true });
  const manifests: ExtManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(extsDir, entry.name, 'tmux-extension.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw) as ExtManifest;
      // Ensure id matches directory name
      manifest.id = entry.name;
      manifests.push(manifest);
    } catch (err: any) {
      console.warn(`[extensions] Failed to load ${manifestPath}: ${err.message}`);
    }
  }

  return manifests;
}

export function spawnExtensionBackend(extDir: string, manifest: ExtManifest): ChildProcess {
  const [cmd, ...args] = (manifest.start as string).split(' ');
  const child = spawn(cmd, args, {
    cwd: extDir,
    env: { ...process.env },
    stdio: 'pipe',
  });

  const prefix = `[ext:${manifest.id}]`;
  child.stdout?.on('data', (d: Buffer) => process.stdout.write(`${prefix} ${d}`));
  child.stderr?.on('data', (d: Buffer) => process.stderr.write(`${prefix} ${d}`));
  child.on('exit', (code) => {
    if (code !== 0) console.warn(`${prefix} exited with code ${code}`);
  });

  return child;
}

export function registerExtensionRoutes(
  app: Hono,
  extsDir: string,
  manifests: ExtManifest[],
): void {
  for (const manifest of manifests) {
    const id      = manifest.id;
    const uiDir   = path.join(extsDir, id, 'ui');
    const backend = manifest.backend;

    // ── Static UI files: GET /ext/:id/ui/* ─────────────────────────────────
    app.get(`/ext/${id}/ui/:file{.+}`, async (c) => {
      const file     = c.req.param('file');
      const filePath = path.join(uiDir, file);

      if (!existsSync(filePath)) return c.notFound();

      const { readFile: rf } = await import('node:fs/promises');
      const content = await rf(filePath);
      const ext     = path.extname(file);
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js':   'application/javascript',
        '.css':  'text/css',
        '.json': 'application/json',
      };
      return c.body(content, 200, {
        'Content-Type': mime[ext] ?? 'application/octet-stream',
      });
    });

    if (!backend) continue;

    // ── Reverse proxy: ALL /ext/:id/api/* → backend ─────────────────────────
    app.all(`/ext/${id}/api/*`, async (c) => {
      const suffix  = c.req.path.slice(`/ext/${id}/api`.length);
      const search  = new URL(c.req.url).search;
      const target  = `${backend}${suffix}${search}`;

      const hasBody = !['GET', 'HEAD', 'DELETE'].includes(c.req.method);
      const bodyBuf = hasBody ? await c.req.arrayBuffer() : undefined;

      const upstream = await fetch(target, {
        method:  c.req.method,
        headers: Object.fromEntries(
          [...c.req.raw.headers.entries()].filter(([k]) => k !== 'host'),
        ),
        body: bodyBuf,
      });

      const body = await upstream.arrayBuffer();
      return c.body(Buffer.from(body), upstream.status as any, {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      });
    });
  }
}
