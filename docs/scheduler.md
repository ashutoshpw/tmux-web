---
title: Scheduler
description: Schedule delayed tmux send-keys tasks that persist across restarts.
---

# Scheduler

Click the clock icon in the session header to schedule a command to be typed into a specific tmux window after a delay.

## How it works

When a task fires, tmux-web runs `tmux send-keys` against `sessionName:windowIndex` — the text is sent literally, then Enter is pressed.

Scheduled tasks persist to `~/.tmux-web/db.json` (or `~/.dev/.tmux-web/db.json` in dev mode), alongside notes — see [Notes](notes.md).

On server restart, surviving tasks are re-armed. Tasks whose fire time already passed are dropped with a log line:

```
[scheduler] dropped missed task <id> (was due <ISO timestamp>)
```

## Recently Triggered history

The `/schedule` page has two tabs:

- **Upcoming** (default) — pending tasks with a live countdown, grouped by session.
- **Recently Triggered** — a history of tasks that fired (`ok` / `error`) or were dropped at startup
  as overdue (`missed`). Each row deep-links to `/s/<session>?window=<index>`, which opens the
  session and switches tmux to the target window.

History is retained for **7 days** by default. Change it with the **Schedule history** setting on the
`/settings` page, or by setting `scheduleHistoryDays` (1–365) in `settings.json`. Records outside the
window are pruned when a task fires and on server startup.

## Limits

| Constraint | Value |
| --- | --- |
| Max text length | 4096 characters |
| Max delay | 24 hours (`86_400_000` ms) |
| Min delay | 1 ms |

## Example

Schedule `terraform apply -auto-approve` to fire in the `deploy` session, window 2, in 30 minutes — close your laptop; the server fires it on time as long as tmux-web stays running.
