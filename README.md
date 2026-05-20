# tmux-web

Access your tmux sessions from the browser. A lightweight web server that lists running tmux sessions and lets you attach to them through a full terminal in your browser — with built-in notes, a scheduler, and a small extension system for sidebar panels.

## Install

```bash
npm install -g tmux-web
```

Or run directly with npx:

```bash
npx tmux-web
```

## Usage

```bash
# Start on default port 3000
tmux-web

# Custom port
PORT=8080 tmux-web
```

Then open `http://localhost:3000` in your browser. You'll see a list of active tmux sessions — click one to attach.

## Notes

Every session has a built-in notes drawer — click the notepad icon in the session header to open a Markdown scratchpad that auto-saves to `~/.tmux-web/db.json` (or `~/.dev/.tmux-web/db.json` when running in dev mode).

**Example:** While debugging in a `staging-debug` session, jot down the failing request IDs and the commit you bisected to. Re-open the session tomorrow and the notes are still there, scoped to that session name.

## Scheduler

Click the clock icon in the session header to schedule a command to be typed into a specific window after a delay. Scheduled tasks persist to disk and are re-armed on server restart (tasks whose fire time already passed are dropped with a log line). Hard limits per task: 4096 chars of text, max delay 24 hours.

**Example:** Schedule `terraform apply -auto-approve` to fire in the `deploy` session, window 2, in 30 minutes — close your laptop, the server fires it on time.

## Extensions

tmux-web ships a small core; everything beyond the terminal lives in extensions — separate npm packages discovered at startup, run as isolated child processes, and rendered into the session sidebar. The reference extension `@tmux-web/ext-github-actions` shows GitHub Actions runs for the repo you're working in.

```bash
tmux-web add @tmux-web/ext-github-actions    # install + enable
tmux-web list                                 # show enabled plugins
tmux-web remove @tmux-web/ext-github-actions  # uninstall + disable
```

Enabled plugins live in `~/.config/tmux-web/settings.json` (or `~/.dev/.config/tmux-web/settings.json` in dev mode); installed packages live in `~/.tmux-web/node_modules/` (or `~/.dev/.tmux-web/node_modules/` in dev mode). Build your own with a `tmux-extension.json` manifest, a Hono backend on a Unix socket, and an iframe UI — full guide in [`docs/extensions.md`](docs/extensions.md).

**Example:** Add the GitHub Actions extension and the sidebar shows live run status for the repo you're working in — flip to a red dot the moment a deploy starts failing, without leaving the terminal.

## Prerequisites

- **Node.js** >= 18
- **tmux** installed and available in your PATH
- Writable `~/.tmux-web/` (or `~/.dev/.tmux-web/` in dev mode), and `~/.config/tmux-web/` (or `~/.dev/.config/tmux-web/` in dev mode) for plugin installs, notes, and scheduled tasks

## How it works

- The landing page lists all active tmux sessions; clicking one opens a full terminal view powered by [ghostty-web](https://github.com/nickolay/ghostty-web)
- The browser connects to the server over WebSocket, which spawns `tmux attach-session` via a PTY — resize, input, and scrollback all work, and the client auto-reconnects if the connection drops
- The notes drawer (per-session and global) persists to `~/.tmux-web/db.json` via lowdb (or `~/.dev/.tmux-web/db.json` in dev mode)
- The scheduler queues `tmux send-keys` calls to fire after a delay and re-arms surviving tasks on restart
- Sidebar extensions run as isolated child processes; the host reverse-proxies `/ext/<id>/api/*` to each extension over a Unix socket — see [`docs/extensions.md`](docs/extensions.md)

## License

MIT
