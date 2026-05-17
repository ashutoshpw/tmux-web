import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import os from 'node:os';
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
  /** Absolute path to the extension root directory (set by loader, not from JSON). */
  dir:         string;
}

interface TmuxWebConfig {
  plugins?: string[];
}

const CONFIG_PATH = path.join(os.homedir(), '.config', 'tmux-web', 'settings.json');

async function readConfig(): Promise<TmuxWebConfig> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as TmuxWebConfig;
  } catch {
    return {};
  }
}

async function tryLoadManifest(extDir: string): Promise<ExtManifest | null> {
  const manifestPath = path.join(extDir, 'tmux-extension.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as ExtManifest;
    manifest.dir = extDir;
    return manifest;
  } catch (err: any) {
    console.warn(`[extensions] Failed to load ${manifestPath}: ${err.message}`);
    return null;
  }
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** Resolve a plugin package name to its directory inside node_modules. */
function resolvePluginDir(pkgName: string): string | null {
  const dir = path.join(process.cwd(), 'node_modules', pkgName);
  return existsSync(dir) ? dir : null;
}

export async function loadExtensions(extsDir: string): Promise<ExtManifest[]> {
  const seen = new Set<string>();
  const all:  ExtManifest[] = [];

  function collect(m: ExtManifest) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    all.push(m);
  }

  // 1. Local extensions/ — dev overrides, always loaded
  if (existsSync(extsDir)) {
    const entries = await readdir(extsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const m = await tryLoadManifest(path.join(extsDir, entry.name));
      if (m) collect(m);
    }
  }

  // 2. Plugins listed in ~/.config/tmux-web/settings.json
  const cfg = await readConfig();
  for (const pkgName of cfg.plugins ?? []) {
    const pkgDir = resolvePluginDir(pkgName);
    if (!pkgDir) {
      console.warn(`[extensions] Plugin "${pkgName}" not found in node_modules — run: npm install ${pkgName}`);
      continue;
    }
    const m = await tryLoadManifest(pkgDir);
    if (m) collect(m);
  }

  return all;
}

export async function spawnExtensionBackend(extDir: string, manifest: ExtManifest): Promise<ChildProcess> {
  const port = await findFreePort();
  manifest.backend = `http://127.0.0.1:${port}`;

  const [cmd, ...args] = (manifest.start as string).split(' ');
  const child = spawn(cmd, args, {
    cwd: extDir,
    env: { ...process.env, EXT_PORT: String(port) },
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
  _extsDir: string,
  manifests: ExtManifest[],
): void {
  for (const manifest of manifests) {
    const id      = manifest.id;
    const uiDir   = path.join(manifest.dir, 'ui');
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
