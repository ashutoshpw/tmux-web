# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## What this is

tmux-web bridges browser clients to tmux sessions: a Node server hosts a
web terminal (xterm.js), a session sidebar, quick commands, notes, and a
scheduler, plus sandboxed sidebar extensions.

## Commands

| Command                   | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `bun install`             | Install deps (postinstall fixes node-pty perms)      |
| `bun run dev`             | Build client + extensions, run server via tsx        |
| `bun run typecheck`       | `tsc --noEmit` for `src/` only                       |
| `bun run typecheck:exts`  | Typecheck `packages/` and `extensions/` workspaces   |
| `bun run test`            | Vitest suite (`tests/`, `packages/*/tests/`)         |
| `bun run knip`            | Unused files/exports/deps audit (CI-enforced)        |
| `bun run lint`            | oxlint over all workspaces                           |
| `bun run build`           | Full build incl. extensions                          |
| `bun run verify:dist`     | Assert publishable artifacts exist                   |

Package manager is **bun** (there is no package-lock.json; `npm ci` fails by
design). The server itself runs on Node >= 22.

## Architecture

- `src/index.ts` — server entry: Hono HTTP routes + WebSocket bridge to tmux/PTY.
- `src/lib/` — server modules (sessions, scheduler, tmux wrappers, storage via lowdb).
- `src/browser/terminal-client.ts` — browser client. It is **bundled** by
  `scripts/build-client.mjs` into `dist/assets/` and loaded via a dynamic
  `<script>` import in the generated page HTML — the server never imports it.
  Do not add server-side imports to browser code or vice versa.
- `src/lib/pages/` — server-rendered page HTML for each route.
- `extensions/*` — sidebar extensions. Each has its own `package.json`,
  `node_modules`, and `tmux-extension.json` manifest. The host loads them at
  **runtime** via `src/lib/ext-loader.ts`: the backend (`backend/server.ts`)
  runs as a separate process behind a Unix socket; the UI (`ui/app.ts`) is
  esbuild-bundled and served in an iframe.
- `packages/*` — published shared packages. `ext-sdk` is the iframe bridge
  SDK; `ext-gh-workflow` is shared `gh` CLI helpers consumed by extensions
  via `file:` deps.

## Gotchas

- **Extension deps are invisible to the root.** Root tooling cannot resolve
  `@tmux-web/*` or extension-local packages unless the extension's
  `node_modules` is installed. Vitest aliases `@tmux-web/*` to package
  sources (`vitest.config.ts`); knip ignores them (`knip.jsonc`).
- **`typecheck:exts` builds `packages/` before checking `extensions/`**
  because extensions resolve the packages' types from `dist/index.d.ts`.
  Keep that ordering.
- **Never remove the `ignoreDependencies` entries in `knip.jsonc`** based on
  local runs — locally extension `node_modules` exist, in CI they may not.
- **Root `tsconfig.json` covers `src/` only.** Changes under `packages/` or
  `extensions/` need `bun run typecheck:exts`.
- **Tests import extension/package sources directly** (e.g.
  `tests/git-workflow.test.ts` imports `extensions/git-workflow/backend/*`).
  Pure parsing/validation logic is easiest to test; avoid importing modules
  with process-level side effects at import time.
- `scripts/verify-dist.mjs` gates publishing; if you change build outputs,
  update it and `package.json` `files`.

## Conventions

- Tabs for indentation in TS sources; tests live in `tests/`.
- CI (`.github/workflows/test.yml`) runs: `typecheck:exts`, knip, coverage
  (published to the job summary), and on the Node 22/24 matrix:
  typecheck, tests, build, `verify:dist`. Run the same locally before pushing.
- PRs are auto-labeled `size:*`; keep PRs small and focused (see
  `CONTRIBUTING.md`). UI changes need before/after screenshots.
- Commits: short imperative subject with a scope prefix (`ci:`, `test:`,
  `fix:`, `docs:`), body explaining *why* for non-obvious changes.
