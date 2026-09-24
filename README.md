# tmux-web

Access your tmux sessions from the browser. A lightweight web server that lists running tmux sessions and lets you attach through a full terminal in your browser — with built-in notes, a scheduler, and sidebar extensions.

## Install

```bash
npm install -g tmux-web
```

Or run directly with npx / bunx:

```bash
npx tmux-web
# or
bunx tmux-web
```

## Usage

```bash
# Interactive setup (command bar, GitHub Actions, Git Workflow — uses `gh auth login`, no token file needed locally)
tmux-web setup

# Start on default port 5001
tmux-web

# Custom address and port
TMUX_WEB_HOST=127.0.0.1 TMUX_WEB_PORT=8080 tmux-web

# Custom port using the legacy variable
PORT=8080 tmux-web

# Use the default xterm.js renderer
tmux-web

# Optional: use ghostty-web for terminal rendering
tmux-web --ghostty

# Equivalent environment override
TMUX_WEB_TERMINAL_RENDERER=ghostty tmux-web

# Optional: tail-first buffer loading (see docs/architecture.md)
TMUX_WEB_INITIAL_LINES=1000 TMUX_WEB_HISTORY_CHUNK=500 tmux-web
```

Then open `http://127.0.0.1:5001` in your browser. You'll see a list of active tmux sessions — click one to attach.

For a persistent user service on Linux or macOS, see [Background service](docs/service.md). The service defaults to loopback; non-loopback binds are unauthenticated and require `--allow-remote` during installation.

Secrets in `~/.tmux-web/.env` are loaded automatically when you run `tmux-web`. GitHub sidebar extensions (Actions, Git Workflow) use the [GitHub CLI](https://cli.github.com/) — run `gh auth login` once on the host; no token file is required for normal local use. For headless or server deployments, set `GH_TOKEN` in `.env` instead.

The terminal renderer defaults to xterm.js. Start with `--ghostty` or set `TMUX_WEB_TERMINAL_RENDERER=ghostty` if you want the browser session to use ghostty-web instead. `--xterm` explicitly selects the default renderer.

## Documentation

- [Documentation hub](docs/index.md)
- [Notes](docs/notes.md) — per-session Markdown scratchpad
- [Scheduler](docs/scheduler.md) — delayed `send-keys` tasks
- **Windows drawer** — switch tmux windows from the terminal header (mobile-friendly tab picker)
- [Extensions](docs/extensions.md) — install, configure, and build sidebar plugins
- [Git Workflow](docs/extensions/git-workflow.md) — git status, worktree handoff, commit/push
- [Architecture](docs/architecture.md) — how the server, terminal, and extensions connect
- [Background service](docs/service.md) — systemd and launchd installation

## Prerequisites

- **Node.js** >= 22
- **tmux** installed and available in your PATH
- **GitHub CLI** (`gh`) on your PATH if you use the GitHub Actions or Git Workflow sidebar extensions (`gh auth login`; no token file needed locally)
- Writable `~/.tmux-web/` and `~/.config/tmux-web/` (see [docs](docs/index.md) for dev-mode paths)

## License

MIT
