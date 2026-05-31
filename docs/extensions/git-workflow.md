---
title: Git Workflow
description: Sidebar git status, worktree handoff, and commit/push for GitHub repositories.
---

# Git Workflow

The **Git Workflow** extension (`@tmux-web/ext-git-workflow`) is a sidebar panel tied to the **active tmux pane** in your browser session. It reads that pane's working directory, shows branch and change summary, and lets you hand off to a new git worktree or commit/push — without leaving the terminal page.

Install and enable:

```bash
tmux-web setup                    # interactive — toggle Git Workflow
tmux-web add @tmux-web/ext-git-workflow
```

See [Extensions](../extensions.md) for plugin paths, secrets, and how extensions load.

## Requirements

- **git** on the host `PATH`
- **GitHub CLI** (`gh`) authenticated — `gh auth login` locally, or `GH_TOKEN` in `~/.tmux-web/.env` for headless hosts
- The active pane's cwd must be inside a **git repository** linked to **GitHub** (detected via `gh repo view`)

Non-GitHub remotes show an empty state: *Works with GitHub repositories only*.

## Opening the panel

Click the **⎇** icon in the session sidebar. The extension:

1. Resolves the **active pane** for that tmux session (follows window/pane focus as you switch)
2. Fetches git status once immediately
3. Polls every **10 seconds** while the drawer stays open (`pollIntervalMs` in `tmux-extension.json`)
4. Stops polling when you close the drawer

Status is always for the pane you are looking at in the terminal — not a fixed repo path configured elsewhere.

## Environment panel

| UI | Meaning |
| --- | --- |
| **Local** / **Worktree** badge | **Local** — repo root is outside `~/.worktrees/`. **Worktree** — cwd is under `~/.worktrees/<org>/<repo>/…` |
| Branch name | Current branch in that pane's repo |
| `+N` / `-M` | Rough line change counts from `git status --porcelain` |
| Path | Pane working directory |
| Main repo path | Shown in worktree mode; copy button writes the primary checkout path |

Branch list for handoff comes from local and remote branches on the **main** repository (the first worktree in `git worktree list`), not from the worktree checkout alone.

## Handoff to worktree

Available in **Local** mode only.

1. Pick or type a branch name
2. Confirm handoff

The extension:

1. Creates a directory at `~/.worktrees/<org>/<repo>/<8-char-id>/` (random id, retries on collision)
2. Runs `git worktree add` from the main repo root
3. If the branch exists only on `origin`, fetches it locally first
4. If the branch is **already checked out** elsewhere, creates `tmux-web/<branch>/<id>` from that branch instead
5. If the branch does not exist, asks you to confirm creation
6. If the pane is **idle at a shell prompt**, sends `cd <worktree-path>` into the pane via tmux `send-keys`

### Pane must be ready for `cd`

Handoff always creates the worktree. Automatic `cd` only runs when the pane looks safe:

- Foreground process is a shell (`bash`, `zsh`, `fish`, `sh`, `dash`)
- Not in alternate-screen mode (e.g. full-screen TUI)
- No agent-style busy hints in the last lines of the pane (interrupt prompts, numbered menus)

If `cd` is skipped, the worktree path is still returned — run `cd` yourself when the pane is free.

## Commit or push

Available in **Local** mode when there are uncommitted changes or unpushed commits.

| State | Action |
| --- | --- |
| Dirty working tree | Prompts for a message, then `git add -A`, `git commit`, and `git push` if ahead of upstream |
| Clean tree, commits ahead | Push only |
| Clean and up to date | Button disabled |

Push uses plain `git push` from the pane's repo root (respects your git remote and upstream config).

## Worktree mode

When cwd is under `~/.worktrees/`, the panel is read-only for handoff and commit/push — you see status and the main repo path, but branch selection and those actions are hidden. Switch back to the main checkout (or open another pane there) to use them.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| *Could not detect pane working directory* | tmux could not resolve cwd for the pane (empty `pane_current_path`; host falls back to `lsof` on the pane PID) |
| *Not a git repository* | Pane cwd is outside any git repo |
| *Works with GitHub repositories only* | `gh repo view` failed — wrong remote, no auth, or not a GitHub repo |
| *Failed to load git status* | Backend error; check tmux-web logs for `[ext:ext-git-workflow]` |
| Worktree created but no `cd` | Pane not ready — see [Pane must be ready for `cd`](#pane-must-be-ready-for-cd) |
| Extension missing after install | Restart tmux-web; confirm `tmux-web list` shows the package enabled |

## Configuration

In `tmux-extension.json`:

```json
{
  "config": {
    "pollIntervalMs": 10000
  }
}
```

Poll interval applies only while the sidebar drawer is open.
