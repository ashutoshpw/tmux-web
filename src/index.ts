#!/usr/bin/env node
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { listSessions } from "./sessions.js";
import { renderLanding, renderTerminal, renderNotesIndex, renderNotesPage } from "./frontend.js";

type ClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number };

const activePtys = new Set<pty.IPty>();

const app = new Hono();

app.get("/", (c) => {
	const sessions = listSessions();
	return c.html(renderLanding(sessions));
});

app.get("/s/:session", (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	return c.html(renderTerminal(session));
});

app.get("/notes", (c) => {
	return c.html(renderNotesIndex());
});

app.get("/notes/:session", (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	return c.html(renderNotesPage(session));
});

const port = parseInt(process.env.PORT || "3000", 10);

const server = serve({ fetch: app.fetch, port }, (info) => {
	console.log(`tmux-web running at http://localhost:${info.port}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
	const url = new URL(req.url || "/", `http://${req.headers.host}`);
	const match = url.pathname.match(/^\/ws\/(.+)$/);
	if (!match) {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit("connection", ws, req, decodeURIComponent(match[1]));
	});
});

wss.on("connection", (ws: WebSocket, _req: import("http").IncomingMessage, sessionName: string) => {
	let ptyProcess: pty.IPty | null = null;

	try {
		ptyProcess = pty.spawn("tmux", ["attach-session", "-t", sessionName], {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			cwd: process.env.HOME || "/",
			env: process.env as Record<string, string>,
		});
	} catch (err: any) {
		ws.send(
			`\r\n\x1b[31mFailed to attach to tmux session "${sessionName}": ${err.message}\x1b[0m\r\n`,
		);
		ws.close(1011, "pty spawn failed");
		return;
	}

	activePtys.add(ptyProcess);

	ptyProcess.onData((data: string) => {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(data);
		}
	});

	ptyProcess.onExit(({ exitCode }) => {
		if (ptyProcess) activePtys.delete(ptyProcess);
		ptyProcess = null;
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(
				`\r\n\x1b[2m--- tmux exited (code ${exitCode}) ---\x1b[0m\r\n`,
			);
			ws.close(1000, "pty exited");
		}
	});

	ws.on("message", (raw) => {
		if (!ptyProcess) return;
		const data = typeof raw === "string" ? raw : raw.toString("utf-8");

		let msg: ClientMessage;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}

		if (msg.type === "input" && typeof msg.data === "string") {
			ptyProcess.write(msg.data);
		} else if (
			msg.type === "resize" &&
			typeof msg.cols === "number" &&
			typeof msg.rows === "number"
		) {
			ptyProcess.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
		}
	});

	ws.on("close", () => {
		if (ptyProcess) {
			activePtys.delete(ptyProcess);
			ptyProcess.kill();
			ptyProcess = null;
		}
	});

	ws.on("error", () => {
		if (ptyProcess) {
			activePtys.delete(ptyProcess);
			ptyProcess.kill();
			ptyProcess = null;
		}
	});
});

function cleanup() {
	for (const p of activePtys) {
		try {
			p.kill();
		} catch {}
	}
	activePtys.clear();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
