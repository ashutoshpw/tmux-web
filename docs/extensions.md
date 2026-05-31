---
title: Extensions
description: How to install, configure, and build tmux-web extensions.
---

# Extensions

tmux-web ships a small core. Anything beyond the terminal — GitHub Actions status, deploy panels, CI dashboards, etc. — lives in **extensions**: separate npm packages discovered at startup, run as isolated child processes, and rendered into the sidebar as iframes.

## For users

### Quick setup (recommended)

```bash
tmux-web setup
```

Walks through optional features: command bar, GitHub Actions, and Git Workflow extensions. When either GitHub extension is enabled, setup checks `gh auth status` and prints instructions if you are not logged in. No `GITHUB_PAT` or `.env` token is required for normal local use — `gh auth login` is enough.

Non-interactive:

```bash
tmux-web setup --yes
tmux-web setup --commandbar --github-actions
```

### Install and enable a plugin manually

```bash
tmux-web add @tmux-web/ext-github-actions
```

This does two things:

1. Installs the package into `~/.tmux-web/node_modules/` (or `~/.dev/.tmux-web/node_modules/` when running in dev mode)
2. Appends it to `~/.config/tmux-web/settings.json`'s `plugins` array (or `~/.dev/.config/tmux-web/settings.json` in dev mode)

You can then run `tmux-web` (or `npx tmux-web` / `bunx tmux-web`) from anywhere and the plugin loads automatically.

### List, remove

```bash
tmux-web list                              # show enabled plugins + install status
tmux-web remove @tmux-web/ext-github-actions
```

`remove` uninstalls the package and removes it from `settings.json`. Idempotent.

### Where things live

| Path | Contents |
| --- | --- |
| `~/.config/tmux-web/settings.json` (or `~/.dev/.config/tmux-web/settings.json` in dev mode) | Declarative list of enabled plugins |
| `~/.tmux-web/node_modules/` (or `~/.dev/.tmux-web/node_modules/` in dev mode) | Installed plugin packages |
| `~/.tmux-web/extensions/<id>/` (or `~/.dev/.tmux-web/extensions/<id>/` in dev mode) | Per-extension state directory (passed to the extension as `EXT_DATA_DIR`) |
| `~/.tmux-web/db.json` (or `~/.dev/.tmux-web/db.json` in dev mode) | tmux-web's own notes + scheduler state |
| `~/.tmux-web/.env` (or `~/.dev/.tmux-web/.env` in dev mode) | Secrets — loaded automatically on startup |

### Secrets and env vars

Extensions inherit the env of the `tmux-web` process. **tmux-web loads `~/.tmux-web/.env` automatically** on every start (dev mode uses `~/.dev/.tmux-web/.env`). Variables already set in your shell are not overwritten.

The GitHub Actions and Git Workflow extensions call GitHub through **`gh api`** / **`gh repo view`**, so you need the [GitHub CLI](https://cli.github.com/) installed and on your `PATH`. Authenticate locally with:

```bash
gh auth login
```

No `~/.tmux-web/.env` token is required for normal interactive use on your machine.

For headless or systemd deployments where interactive login is not possible, set a token in `~/.tmux-web/.env` instead (`gh` honors `GH_TOKEN`; `GITHUB_PAT` is also passed through as `GH_TOKEN`):

```bash
cat > ~/.tmux-web/.env <<'EOF'
GH_TOKEN=github_pat_xxx
PORT=9878
EOF
chmod 600 ~/.tmux-web/.env

tmux-web
```

For a systemd service, use `EnvironmentFile=/home/youruser/.tmux-web/.env` (same path tmux-web reads by default). The service user must either have run `gh auth login` or have `GH_TOKEN`/`GITHUB_PAT` set in that file.

---

## For extension authors

### What a tmux-web extension is

A tmux-web extension is an npm package with:

- a `tmux-extension.json` manifest at the package root
- a backend process (typically a Hono server) that listens on a Unix socket
- a UI bundle (single HTML + JS) loaded into a sidebar iframe

The host (tmux-web) discovers the extension via the `plugins` config, spawns the backend as a child process, and reverse-proxies all `/ext/<id>/api/*` requests to it over the Unix socket.

### Layout

```
my-extension/
├── package.json
├── tmux-extension.json
├── backend/
│   ├── server.ts
│   └── routes/
└── ui/
    ├── index.html
    └── app.ts
```

After build:

```
dist/
├── backend/server.js
└── ui/
    ├── app.js
    └── index.html
```

### `tmux-extension.json` manifest

```json
{
  "name": "My Extension",
  "icon": "⚡",
  "slot": "sidebar",
  "permissions": ["network:api.example.com"],
  "views": [{ "entry": "index.html" }],
  "start": "node dist/backend/server.js",
  "config": {
    "pollIntervalMs": 60000
  }
}
```

| Field | Purpose |
| --- | --- |
| `name`, `icon` | Shown in the sidebar header |
| `slot` | Only `sidebar` is implemented today |
| `permissions` | Documentary — not enforced yet |
| `views[].entry` | The HTML entry point inside `dist/ui/` |
| `start` | Command tmux-web runs (cwd = extension dir) |
| `config` | Arbitrary JSON passed to the UI via `ext.onConfig()` |

There is **no `id` field** — the id is derived from `package.json`'s `name`, with any `@scope/` prefix stripped. So `@tmux-web/ext-github-actions` → id is `ext-github-actions`. This becomes the URL prefix (`/ext/ext-github-actions/...`), the socket name, and the data-dir name. Renaming the npm package is the only renaming needed.

### `package.json`

```json
{
  "name": "@tmux-web/ext-github-actions",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist/", "tmux-extension.json"],
  "scripts": {
    "build:backend": "tsc -p tsconfig.json",
    "build:ui": "mkdir -p dist/ui && esbuild ui/app.ts --bundle --outfile=dist/ui/app.js --platform=browser --target=es2020 && cp ui/index.html dist/ui/index.html",
    "build": "npm run build:backend && npm run build:ui",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@hono/node-server": "^1.19.0",
    "hono": "^4.7.0"
  }
}
```

Only `dist/` and `tmux-extension.json` are published — sources stay in the repo.

### Backend

The backend can be any HTTP server, but Hono pairs nicely (small, same framework as the host):

```ts
// backend/server.ts
import { Hono } from 'hono';
import { createAdaptorServer, serve } from '@hono/node-server';
import { unlinkSync } from 'node:fs';

const app = new Hono();
app.get('/hello', (c) => c.json({ msg: 'hi' }));

const sockPath = process.env.EXT_SOCKET;
if (sockPath) {
  try { unlinkSync(sockPath); } catch {}
  createAdaptorServer({ fetch: app.fetch }).listen(sockPath);
} else {
  // Fallback for direct `npm start` during dev
  serve({ fetch: app.fetch, port: 4100 });
}
```

The host injects two env vars when spawning the child:

| Env var | Purpose |
| --- | --- |
| `EXT_SOCKET` | Absolute path of the Unix socket the backend must `listen()` on |
| `EXT_DATA_DIR` | Pre-created data directory (`~/.tmux-web/extensions/<id>/`) for persistent state (`~/.dev/.tmux-web/extensions/<id>/` in dev mode) |

Use `EXT_DATA_DIR` for any file-backed storage so user data lives outside the package install:

```ts
const file = path.join(process.env.EXT_DATA_DIR!, 'data.json');
```

### UI

The UI is loaded into an iframe at `/ext/<id>/ui/index.html`. The host bridges the iframe via `postMessage` and a small SDK:

```ts
// ui/app.ts
import { createExtension } from '@tmux-web/ext-sdk';

const ext = createExtension();   // id auto-detected from iframe URL

ext.onContext(({ session }) => {
  console.log('attached to session:', session);
});

ext.onConfig(async (cfg) => {
  const data = await ext.request<{ items: any[] }>('/hello');
  // render…
  ext.resize(document.body.scrollHeight);
});

ext.ready();
```

What the SDK gives you:

| API | Description |
| --- | --- |
| `ext.onContext(cb)` | Fires once with `{ session, host }` after the iframe loads |
| `ext.onConfig(cb)` | Fires with the `config` block from `tmux-extension.json` |
| `ext.onOpen(cb)` | Fires when the user opens the extension drawer |
| `ext.onClose(cb)` | Fires when the user closes the extension drawer |
| `ext.ready()` | Signal to the host that handlers are registered (call after `onContext` / `onOpen` setup) |
| `ext.request<T>(path, opts?)` | Fetches `/ext/<id>/api${path}` — proxied to your backend's socket |
| `ext.resize(height)` | Tells the host how tall the drawer should be |

`ext.request()` calls are same-origin (the host is serving them), so no CORS dance and no token plumbing — they just land at your backend over the Unix socket.

### Architecture in one diagram

```
browser iframe                  tmux-web host                       extension child
─────────────────             ───────────────────                   ──────────────────
ext.request('/runs') ─HTTP──► /ext/<id>/api/runs ──Unix socket──►  Hono /runs handler
                                  │
                                  └── /ext/<id>/ui/*  ──serves──► dist/ui/* static files
postMessage('ext:ready')  ◄────── 
postMessage('ext:context') ──────►
postMessage('ext:open')   ──────►  (drawer opened)
postMessage('ext:close')  ──────►  (drawer closed)
postMessage('ext:resize')   ◄────
```

Each extension is its own child process. A crash in one extension doesn't take down tmux-web. Each gets its own deterministic socket (`/tmp/tmux-web-ext-<id>.sock`) and data dir.

### Local development

Drop the extension directory into the tmux-web repo's `extensions/` folder:

```
tmux-web/
└── extensions/
    └── my-extension/
        ├── package.json
        ├── tmux-extension.json
        ├── backend/
        └── ui/
```

The host's resolver checks `extensions/` first (highest priority), so local code overrides any installed npm version with the same id. `npm run dev` from the tmux-web repo rebuilds the extension automatically via the `predev` hook.

### Publishing

```bash
cd my-extension
npm publish --access public   # --access is required for scoped names
```

Users install via:

```bash
tmux-web add @yourscope/your-extension
```

### Bundled extensions

| Extension | Guide |
| --- | --- |
| `@tmux-web/ext-git-workflow` | [Git Workflow](extensions/git-workflow.md) — git status, worktree handoff, commit/push |
