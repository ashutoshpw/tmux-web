#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";

// Ensure node-pty's spawn-helper is executable. Some installers (notably npx
// with hoisted deps) strip the +x bit, which makes pty.spawn fail with
// posix_spawnp.
try {
	const ptyDir = path.dirname(createRequire(import.meta.url).resolve("node-pty/package.json"));
	const prebuilds = path.join(ptyDir, "prebuilds");
	if (existsSync(prebuilds)) {
		for (const arch of readdirSync(prebuilds)) {
			const helper = path.join(prebuilds, arch, "spawn-helper");
			if (existsSync(helper) && !(statSync(helper).mode & 0o111)) {
				chmodSync(helper, 0o755);
			}
		}
	}
} catch {}
import { listSessions } from "./sessions.js";
import { renderLanding, renderTerminal, renderNotesIndex, renderNotesPage } from "./frontend.js";
import { db, type StoredTask } from "./lib/db.js";
import { recordSessionAccess, getSessionAccessMap } from "./lib/session-access.js";
import { loadExtensions, spawnExtensionBackend, registerExtensionRoutes } from "./lib/ext-loader.js";
import { loadDotEnv } from "./lib/load-env.js";
import { cmdAdd, cmdRemove, cmdList, cmdSetup, cmdTheme, printUsage, printVersion } from "./lib/cli.js";
import { readSettings } from "./lib/settings.js";
import { readActiveTheme } from "./lib/theme-store.js";
import { buildCommandbarSessions } from "./lib/commandbar.js";
import {
	getSessionPaneTarget,
	capturePaneTail,
	capturePaneHistoryChunk,
	isAlternateScreen,
} from "./lib/tmux-capture.js";
import { readTerminalBufferConfig } from "./lib/terminal-config.js";
import { ImageUploadError, saveUploadedImage } from "./lib/image-upload.js";
import {
	listSessionWindows,
	selectSessionWindow,
	TmuxWindowsError,
} from "./lib/tmux-windows.js";

loadDotEnv();

const terminalBufferConfig = readTerminalBufferConfig();
type TerminalRenderer = "xterm" | "ghostty";

function parseTerminalRenderer(args: string[]): TerminalRenderer {
	const env = process.env.TMUX_WEB_TERMINAL_RENDERER?.trim().toLowerCase();
	let renderer: TerminalRenderer = env === "ghostty" ? "ghostty" : "xterm";
	for (const arg of args) {
		if (arg === "--ghostty") renderer = "ghostty";
		if (arg === "--xterm") renderer = "xterm";
	}
	return renderer;
}

const startupArgs = process.argv.slice(2);
const terminalRenderer = parseTerminalRenderer(startupArgs);

// ── CLI subcommand dispatch ───────────────────────────────────────────────
// Runs before any server setup so `tmux-web add/remove/list` are fast and
// don't try to bind a port or load the db.
{
	const args = startupArgs.filter((arg) => arg !== "--ghostty" && arg !== "--xterm");
	if (args.length > 0) {
		const [sub, arg] = args;
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
			case "setup":
				await cmdSetup(args);
				process.exit(0);
			case "theme":
				await cmdTheme(args.slice(1));
				process.exit(0);
			case "help":
			case "--help":
			case "-h":
				printUsage();
				process.exit(0);
			case "-V":
			case "--version":
			case "-v":
				printVersion();
				process.exit(0);
			default:
				console.error(`unknown argument: ${sub}`);
				printUsage();
				process.exit(1);
		}
	}
}

type ClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "load_history"; before: number };

type ServerMessage =
	| { type: "snapshot"; data: string; lines: number }
	| { type: "data"; data: string }
	| { type: "history"; data: string; before: number; lines: number };

function sendServerMessage(ws: WebSocket, msg: ServerMessage) {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(msg));
	}
}

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

const settings = await readSettings();
const activeTheme = await readActiveTheme();
const commandbarEnabled = settings.commandbar === true;
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

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const assetDirs = [
	path.join(moduleDir, "assets"),
	path.join(process.cwd(), "dist", "assets"),
];

app.get("/assets/:file", async (c) => {
	const file = c.req.param("file");
	if (!/^[a-zA-Z0-9._-]+$/.test(file)) return c.notFound();
	for (const dir of assetDirs) {
		const filePath = path.join(dir, file);
		if (!existsSync(filePath)) continue;
		const content = await readFile(filePath);
		const ext = path.extname(file);
		const mime: Record<string, string> = {
			".css": "text/css; charset=utf-8",
			".js": "application/javascript; charset=utf-8",
			".map": "application/json; charset=utf-8",
		};
		return c.body(content, 200, {
			"Content-Type": mime[ext] ?? "application/octet-stream",
		});
	}
	return c.notFound();
});

// ── Page routes ────────────────────────────────────────────────────────────

app.get("/", (c) => {
	const view = c.req.query("view") === "recent" ? "recent" : "default";
	const sessions = listSessions();
	const accessMap = getSessionAccessMap();
	const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(sessions, accessMap) : [];
	return c.html(renderLanding(sessions, { view, accessMap, commandbarEnabled, commandbarSessions, theme: activeTheme }));
});

app.get("/s/:session", async (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	await recordSessionAccess(session);
	const sessions = listSessions();
	const accessMap = getSessionAccessMap();
	const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(sessions, accessMap) : [];
	return c.html(renderTerminal(session, extensions, {
		commandbarEnabled,
		commandbarSessions,
		terminal: terminalBufferConfig,
		theme: activeTheme,
		renderer: terminalRenderer,
	}));
});

app.get("/notes", (c) => {
	return c.html(renderNotesIndex(db.data.notes, activeTheme));
});

app.get("/notes/:session", (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	return c.html(renderNotesPage(session, activeTheme));
});

app.get("/api/sessions", (c) => {
	if (!commandbarEnabled) return c.json({ error: "commandbar disabled" }, 404);
	return c.json(buildCommandbarSessions(listSessions(), getSessionAccessMap()));
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

app.post("/api/session/:session/upload", async (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	const sessions = listSessions();
	if (!sessions.some((s) => s.name === session)) {
		return c.json({ error: "session not found" }, 404);
	}

	let body: Record<string, unknown>;
	try {
		body = await c.req.parseBody();
	} catch {
		return c.json({ error: "invalid multipart body" }, 400);
	}

	const file = body.file;
	if (!(file instanceof File)) {
		return c.json({ error: "missing file field" }, 400);
	}

	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const { path: filePath } = await saveUploadedImage(buffer, file.type || undefined);
		return c.json({ path: filePath });
	} catch (err) {
		if (err instanceof ImageUploadError) {
			return c.json({ error: err.message }, err.status);
		}
		console.error("[upload]", err);
		return c.json({ error: "upload failed" }, 500);
	}
});

app.get("/api/session/:session/windows", (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	return c.json(listSessionWindows(session));
});

app.post("/api/session/:session/select-window", async (c) => {
	const session = decodeURIComponent(c.req.param("session"));
	let body: { windowIndex?: unknown };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid json" }, 400);
	}

	const { windowIndex } = body;
	if (
		typeof windowIndex !== "number" ||
		!Number.isInteger(windowIndex) ||
		windowIndex < 0
	) {
		return c.json({ error: "windowIndex must be a non-negative integer" }, 400);
	}

	try {
		selectSessionWindow(session, windowIndex);
		return c.json({ ok: true });
	} catch (err) {
		if (err instanceof TmuxWindowsError) {
			return c.json({ error: err.message }, err.status);
		}
		console.error("[select-window]", err);
		return c.json({ error: "select-window failed" }, 500);
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
	const { initialLines, historyChunk, syncIdleMs, syncMaxMs } = terminalBufferConfig;

	let syncing = true;
	let syncIdleTimer: ReturnType<typeof setTimeout> | null = null;
	let syncMaxTimer: ReturnType<typeof setTimeout> | null = null;
	let paneTarget = sessionName;

	const clearSyncTimers = () => {
		if (syncIdleTimer) {
			clearTimeout(syncIdleTimer);
			syncIdleTimer = null;
		}
		if (syncMaxTimer) {
			clearTimeout(syncMaxTimer);
			syncMaxTimer = null;
		}
	};

	const finishSync = () => {
		if (!syncing) return;
		clearSyncTimers();
		syncing = false;

		try {
			paneTarget = getSessionPaneTarget(sessionName);
		} catch {
			paneTarget = sessionName;
		}

		if (!isAlternateScreen(paneTarget)) {
			try {
				const data = capturePaneTail(paneTarget, initialLines);
				sendServerMessage(ws, { type: "snapshot", data, lines: initialLines });
			} catch {
				// No snapshot — client waits for live PTY output
			}
		}
	};

	const scheduleSyncEnd = () => {
		if (!syncing) return;
		if (syncIdleTimer) clearTimeout(syncIdleTimer);
		syncIdleTimer = setTimeout(finishSync, syncIdleMs);
	};

	try {
		ptyProcess = pty.spawn("tmux", ["attach-session", "-t", sessionName], {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			cwd: process.env.HOME || "/",
			env: process.env as Record<string, string>,
		});
	} catch (err: any) {
		sendServerMessage(ws, {
			type: "data",
			data: `\r\n\x1b[31mFailed to attach to tmux session "${sessionName}": ${err.message}\x1b[0m\r\n`,
		});
		ws.close(1011, "pty spawn failed");
		return;
	}

	activePtys.add(ptyProcess);

	syncMaxTimer = setTimeout(finishSync, syncMaxMs);

	ptyProcess.onData((data: string) => {
		if (syncing) {
			scheduleSyncEnd();
			return;
		}
		sendServerMessage(ws, { type: "data", data });
	});

	ptyProcess.onExit(({ exitCode }) => {
		clearSyncTimers();
		if (ptyProcess) activePtys.delete(ptyProcess);
		ptyProcess = null;
		sendServerMessage(ws, {
			type: "data",
			data: `\r\n\x1b[2m--- tmux exited (code ${exitCode}) ---\x1b[0m\r\n`,
		});
		ws.close(1000, "pty exited");
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
		} else if (msg.type === "load_history" && typeof msg.before === "number") {
			const before = Math.max(0, Math.floor(msg.before));
			try {
				const { data: chunk, lines } = capturePaneHistoryChunk(
					paneTarget,
					before,
					historyChunk,
				);
				sendServerMessage(ws, { type: "history", data: chunk, before, lines });
			} catch {
				sendServerMessage(ws, { type: "history", data: "", before, lines: 0 });
			}
		}
	});

	ws.on("close", () => {
		clearSyncTimers();
		if (ptyProcess) {
			activePtys.delete(ptyProcess);
			ptyProcess.kill();
			ptyProcess = null;
		}
	});

	ws.on("error", () => {
		clearSyncTimers();
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
