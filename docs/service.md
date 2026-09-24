# Background service

`tmux-web` can run as a user service on Linux systems with systemd and on macOS with launchd. The service uses the same user account, data directory, tmux sessions, plugins, and `.env` file as a foreground process.

## Install and manage

```sh
tmux-web service install
tmux-web service status
tmux-web service restart
tmux-web service uninstall
```

`service install` is safe to run again. It repairs or refreshes the registration and starts the service. `service uninstall` removes only the service registration; it does not remove `~/.tmux-web`, `~/.config/tmux-web`, plugins, uploads, notes, scheduler state, or tmux sessions.

Use `--no-start` to write or refresh the registration without starting it. The next `service restart` applies it. Use `--force` only when explicitly taking over a registration that is no longer recognized as owned by this installation.

## Address and environment

The listener defaults to `127.0.0.1:5001`. Set the address with `TMUX_WEB_HOST` and `TMUX_WEB_PORT`; `PORT` remains supported as a legacy port fallback. Command-line values take precedence over environment values.

```sh
TMUX_WEB_HOST=127.0.0.1
TMUX_WEB_PORT=5001
```

A service install accepts a non-loopback address only with `--allow-remote`:

```sh
tmux-web service install --host 0.0.0.0 --allow-remote
```

tmux-web has no built-in authentication or TLS. A non-loopback listener exposes terminal control, session management, uploads, scheduler actions, and extension routes. Use a private network or an authenticated TLS reverse proxy, and protect the `.env` file with restrictive permissions.

Service mode always uses production state paths. Development variables such as `TMUX_WEB_DEV`, `TMUX_WEB_MODE=development`, and `NODE_ENV=development` are not valid for a background service.

## Platform behavior

### Linux

The service is a systemd user unit at `~/.config/systemd/user/tmux-web.service`. It uses `systemctl --user`; tmux-web does not run the service as root. A user manager and lingering must be available for the service to survive logout and start at boot.

Inspect it with:

```sh
systemctl --user status tmux-web.service
less ~/.tmux-web/logs/service.log
```

If the service stops after logout, enable lingering for the normal user with the system administrator:

```sh
sudo loginctl enable-linger "$(id -un)"
```

### macOS

The service is a LaunchAgent at `~/Library/LaunchAgents/com.ashutoshpw.tmux-web.plist`. It starts at graphical login and stops at logout. An SSH-only or pre-login installation can be registered successfully but remain `registered-awaiting-login` until a graphical login exists.

Inspect it with:

```sh
launchctl print gui/"$(id -u)"/com.ashutoshpw.tmux-web
```

## Update and troubleshooting

Update the installed package using its normal package manager, then run:

```sh
tmux-web service install
```

`service install` refreshes the absolute runtime and package paths. `service restart` alone only restarts the existing registration.

Check `service status` first. It reports the unit path, log path, address, ownership problems, missing entrypoints, and whether a restart is pending. Do not remove a generated unit by hand while another tmux-web installation may own it.
