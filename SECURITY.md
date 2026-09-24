# Security Policy

## Supported Versions

Only the latest release published to [npm](https://www.npmjs.com/package/tmux-web) receives security fixes.

| Version                      | Supported |
| ---------------------------- | --------- |
| latest on npm                | ✅        |
| anything older               | ❌        |

## Reporting a Vulnerability

**Do not open a public issue for security reports.**

Use GitHub's private vulnerability reporting:
<https://github.com/ashutoshpw/tmux-web/security/advisories/new>

Please include:

- A description of the vulnerability and its impact
- Step-by-step reproduction instructions
- Affected version(s) and environment (OS, Node/Bun, browser)
- Any logs or proof-of-concept details (redact secrets)

You can expect an initial response within a few days. Fixes are released as
soon as practical, and you will be credited in the release notes unless you
prefer to remain anonymous.

## Scope Notes

tmux-web runs a local server that bridges browser clients to tmux sessions
and a PTY. Reports involving the following are especially relevant:

- Authentication/authorization on the WebSocket and HTTP routes
- Session isolation between browser clients
- Path traversal or command injection via session names, file paths, or
  extension manifests
- PTY permission handling in `scripts/fix-pty-perms.mjs`
- Unsafe network binding through `TMUX_WEB_HOST` or background-service configuration

The HTTP and WebSocket server has no built-in authentication. Keep it on loopback or place it behind an authenticated TLS reverse proxy before exposing it beyond the local machine.
