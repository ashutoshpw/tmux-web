# Contributing

Thanks for your interest in contributing to tmux-web!

## Developer Setup

Requirements: **Node >= 22**, **Bun >= 1.4.2** (package manager / script runner), and **tmux** on your PATH.

```sh
bun install          # install deps (also fixes node-pty perms via postinstall)
bun run dev          # build client + extensions, then start the dev server
```

## Common Commands

| Command                 | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `bun run dev`           | Build client/extensions and run the server (tsx)    |
| `bun run typecheck`     | `tsc --noEmit`                                      |
| `bun run typecheck:exts` | Typecheck packages/ and extensions/ workspaces      |
| `bun run test`          | Vitest suite                                        |
| `bun run coverage`      | Vitest with v8 coverage report                      |
| `bun run build`         | Full build (drawer check, client, extensions, dist) |
| `bun run knip`          | Unused files/exports/dependencies audit             |
| `bun run verify:dist`   | Assert the published build artifacts exist          |

CI runs the full set on every PR — please make sure they pass locally first.

## Pull Request Guidelines

- **Keep PRs small and focused.** One bug fix or one feature per PR; do not mix unrelated changes.
- **Explain what changed and why.** The PR template prompts for this.
- **Add or update tests** for behavior changes.
- **Include before/after screenshots** for UI changes (browser client, sidebar, extensions); a short video for animation/interaction changes.
- **Update docs** in `docs/` when how to use a feature changes.

PRs are automatically labeled with a `size:*` label based on effective
changed lines (test files are excluded in mixed PRs). If a PR lands in
`size:XL`/`size:XXL`, consider splitting it.

## Reporting Bugs

Open a [bug report](https://github.com/ashutoshpw/tmux-web/issues/new?template=bug_report.yml)
with a minimal, deterministic repro. See [SECURITY.md](SECURITY.md) for
reporting vulnerabilities privately.

## License

By contributing, you agree that your contributions will be licensed under
the MIT license declared in `package.json`.
