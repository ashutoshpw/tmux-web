#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { listSessions } from "./sessions.js";
import { renderLanding, renderTerminal, renderNotesIndex, renderNotesPage } from "./frontend.js";
import { db, type StoredTask } from "./lib/db.js";
import { recordSessionAccess, getSessionAccessMap } from "./lib/session-access.js";
import { loadExtensions, spawnExtensionBackend, registerExtensionRoutes } from "./lib/ext-loader.js";
import { cmdAdd, cmdRemove, cmdList, printUsage } from "./lib/cli.js";

// ── CLI subcommand dispatch ───────────────────────────────────────────────
// Runs before any server setup so `tmux-web add/remove/list` are fast and
// don't try to bind a port or load the db.
{
	const [sub, arg] = process.argv.slice(2);
	switch (sub) {
		case "add":
			if (!arg) { console.error("usage: tmux-web add <package>"); process.exit(1); }
			await cmdAdd(arg);
			process.exit(0);
		case "remove":
		case "rm":
			if (!arg) { console.error("usage: tmux-web remove <package>"); process.exit(1); }
			await cmdRemove(arg);
			process.exit(0);
		case "list":
		case "ls":
			await cmdList();
			process.exit(0);
		case "help":
		case "--help":
		case "-h":
			printUsage();
			process.exit(0);
	}
}

type ClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number };

interface ScheduledTask extends StoredTask {
	timeoutHandle: ReturnType<typeof setTimeout>;
}

const activePtys = new Set<pty.IPty>();
const scheduledTasks = new Map<string, ScheduledTask>();
const extChildren: import("node:child_process").ChildProcess[] = [];

function fireTask(id: string, sessionName: string, windowIndex: number, text: string) {
	const target = `${sessionName}:${windowIndex}`;
	try {
		execFileSync("tmux", ["send-keys", "-t", target, "-l", text], { timeout: 5000 });
		execFileSync("tmux", ["send-keys", "-t", target, "Enter"], { timeout: 5000 });
	} catch (err: any) {
		console.error(`[scheduler] send-keys to ${target} failed: ${err.message}`);
	}
	scheduledTasks.delete(id);
	db.data.scheduledTasks = db.data.scheduledTasks.filter((t) => t.id !== id);
	db.write().catch(console.error);
}

// Init db and re-schedule surviving tasks before starting server
await db.read();
db.data.sessionAccess ??= [];

const extsDir   = path.join(process.cwd(), "extensions");
const extensions = await loadExtensions(extsDir);
for (const ext of extensions) {
	if (ext.start) extChildren.push(spawnExtensionBackend(ext.dir, ext));
}

const now = Date.now();
const missed: string[] = [];
for (const task of db.data.scheduledTasks) {
	if (task.fireAt <= now) {
		missed.push(task.id);
		console.warn(`[scheduler] dropped missed task ${task.id} (was due ${new Date(task.fireAt).toISOString()})`);
	} else {
		const handle = setTimeout(
			() => fireTask(task.id, task.sessionName, task.windowIndex, task.text),
			task.fireAt - now,
		);
		scheduledTasks.set(task.id, { ...task, timeoutHandle: handle });
	}
}
if (missed.length) {
	db.data.scheduledTasks = db.data.scheduledTasks.filter((t) => !missed.includes(t.id));
	await db.write();
}

const app = new Hono();

registerExtensionRoutes(app, extsDir, extensions);

// ── Page routes ────────────────────────────────────────────────────────────

app.get("/", (c) => {
	const view = c.req.query("view") === "recent" ? "recent" : "default";
	const sessions = listSessions();
	const accessMap = getSessionAccessMap();
	return c.html(renderLanding(sessions, { view, accessMap }));
});

app.get("/s/:session", async (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	await recordSessionAccess(session);
	return c.html(renderTerminal(session, extensions));
});

app.get("/notes", (c) => {
	return c.html(renderNotesIndex(db.data.notes));
});

app.get("/notes/:session", (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	return c.html(renderNotesPage(session));
});

// ── Notes API ──────────────────────────────────────────────────────────────

app.get("/api/notes", (c) => {
	const sorted = [...db.data.notes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
	return c.json(sorted);
});

app.get("/api/notes/:scope", (c) => {
	const scope = decodeURIComponent(c.req.param("scope"));
	const note = db.data.notes.find((n) => n.scope === scope);
	return note ? c.json(note) : c.json(null, 404);
});

app.put("/api/notes/:scope", async (c) => {
	const scope = decodeURIComponent(c.req.param("scope"));
	let body: { content?: unknown };
	try { body = await c.req.json(); } catch { return c.json({ error: "invalid json" }, 400); }
	if (typeof body.content !== "string") return c.json({ error: "content must be string" }, 400);
	const record = { scope, content: body.content, updatedAt: Date.now() };
	const idx = db.data.notes.findIndex((n) => n.scope === scope);
	if (idx >= 0) db.data.notes[idx] = record;
	else db.data.notes.push(record);
	await db.write();
	return c.json({ ok: true });
});

// ── Scheduler API ──────────────────────────────────────────────────────────

app.get("/api/session/:session/windows", (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	try {
		const raw = execFileSync(
			"tmux",
			["list-windows", "-t", session, "-F", "#{window_index}\t#{window_name}\t#{window_active}"],
			{ encoding: "utf-8", timeout: 3000 },
		);
		const windows = raw.trim().split("\n").filter(Boolean).map((line) => {
			const [index, name, active] = line.split("\t");
			return { index: parseInt(index, 10), name, active: active === "1" };
		});
		return c.json(windows);
	} catch {
		return c.json([], 200);
	}
});

app.get("/api/schedule", (c) => {
	const session = c.req.query("session");
	const tasks = [...scheduledTasks.values()]
		.filter((t) => !session || t.sessionName === session)
		.map(({ id, sessionName, windowIndex, text, fireAt, createdAt }) => ({
			id, sessionName, windowIndex, text, fireAt, createdAt,
			remainingMs: Math.max(0, fireAt - Date.now()),
		}))
		.sort((a, b) => a.fireAt - b.fireAt);
	return c.json(tasks);
});

app.post("/api/schedule", async (c) => {
	let body: { sessionName?: unknown; windowIndex?: unknown; text?: unknown; delayMs?: unknown };
	try { body = await c.req.json(); } catch { return c.json({ error: "invalid json" }, 400); }

	const { sessionName, windowIndex, text, delayMs } = body;
	if (
		typeof sessionName !== "string" || !sessionName ||
		typeof windowIndex !== "number" || !Number.isInteger(windowIndex) || windowIndex < 0 ||
		typeof text !== "string" || !text || text.length > 4096 ||
		typeof delayMs !== "number" || delayMs < 1 || delayMs > 86_400_000
	) {
		return c.json({ error: "invalid body" }, 400);
	}

	const { randomUUID } = await import("node:crypto");
	const id = randomUUID();
	const createdAt = Date.now();
	const fireAt = createdAt + delayMs;

	const timeoutHandle = setTimeout(() => fireTask(id, sessionName, windowIndex, text), delayMs);
	scheduledTasks.set(id, { id, sessionName, windowIndex, text, fireAt, createdAt, timeoutHandle });
	db.data.scheduledTasks.push({ id, sessionName, windowIndex, text, fireAt, createdAt });
	await db.write();

	return c.json({ id, fireAt });
});

app.delete("/api/schedule/:id", (c) => {
	const id = c.req.param("id");
	const task = scheduledTasks.get(id);
	if (!task) return c.json({ error: "not found" }, 404);
	clearTimeout(task.timeoutHandle);
	scheduledTasks.delete(id);
	db.data.scheduledTasks = db.data.scheduledTasks.filter((t) => t.id !== id);
	db.write().catch(console.error);
	return c.json({ ok: true });
});

// ── WebSocket server ───────────────────────────────────────────────────────

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
			try {
				ptyProcess.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
			} catch {
				// PTY fd already closed — resize arrived after exit, ignore
			}
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
	for (const task of scheduledTasks.values()) {
		try { clearTimeout(task.timeoutHandle); } catch {}
	}
	scheduledTasks.clear();
	for (const p of activePtys) {
		try { p.kill(); } catch {}
	}
	activePtys.clear();
	for (const child of extChildren) {
		try { child.kill("SIGTERM"); } catch {}
	}
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
