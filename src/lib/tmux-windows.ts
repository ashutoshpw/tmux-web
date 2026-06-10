import { execFileSync } from "node:child_process";

export type TmuxWindow = { index: number; name: string; active: boolean };

export class TmuxWindowsError extends Error {
	constructor(
		message: string,
		readonly status: 404 | 500,
	) {
		super(message);
		this.name = "TmuxWindowsError";
	}
}

export function listSessionWindows(session: string): TmuxWindow[] {
	try {
		const raw = execFileSync(
			"tmux",
			["list-windows", "-t", session, "-F", "#{window_index}\t#{window_name}\t#{window_active}"],
			{ encoding: "utf-8", timeout: 3000 },
		);
		return raw
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [index, name, active] = line.split("\t");
				return {
					index: parseInt(index, 10),
					name,
					active: active === "1",
				};
			});
	} catch {
		return [];
	}
}

export type TmuxWindowWithPath = TmuxWindow & { path: string };

export function captureSessionWindowsWithPath(session: string): TmuxWindowWithPath[] {
	try {
		const raw = execFileSync(
			"tmux",
			[
				"list-windows",
				"-t",
				session,
				"-F",
				"#{window_index}\t#{window_name}\t#{window_active}\t#{pane_current_path}",
			],
			{ encoding: "utf-8", timeout: 3000 },
		);
		return raw
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [index, name, active, path] = line.split("\t");
				return {
					index: parseInt(index, 10),
					name,
					active: active === "1",
					path: path ?? "",
				};
			});
	} catch {
		return [];
	}
}

// A linked git worktree reports a different --git-dir than --git-common-dir;
// the main worktree reports them equal. Any non-git dir / error → not a worktree.
export function isGitWorktree(dir: string): boolean {
	if (!dir) return false;
	try {
		const out = execFileSync(
			"git",
			["-C", dir, "rev-parse", "--git-dir", "--git-common-dir"],
			{ encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] },
		);
		const [gitDir, commonDir] = out.trim().split("\n");
		if (!gitDir || !commonDir) return false;
		return gitDir !== commonDir;
	} catch {
		return false;
	}
}

function sessionExists(session: string): boolean {
	try {
		execFileSync("tmux", ["has-session", "-t", session], { timeout: 3000 });
		return true;
	} catch {
		return false;
	}
}

export function newSessionWindow(session: string): void {
	if (!sessionExists(session)) {
		throw new TmuxWindowsError("session not found", 404);
	}
	try {
		execFileSync("tmux", ["new-window", "-t", session], { timeout: 3000 });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "new-window failed";
		throw new TmuxWindowsError(message, 500);
	}
}

export function newTmuxSession(name: string, dir?: string): void {
	const args = ["new-session", "-d", "-s", name];
	if (dir) args.push("-c", dir);
	try {
		execFileSync("tmux", args, { timeout: 5000 });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "new-session failed";
		throw new TmuxWindowsError(message, 500);
	}
}

export function selectSessionWindow(session: string, windowIndex: number): void {
	if (!sessionExists(session)) {
		throw new TmuxWindowsError("session not found", 404);
	}

	const windows = listSessionWindows(session);
	if (!windows.some((w) => w.index === windowIndex)) {
		throw new TmuxWindowsError("window not found", 404);
	}

	try {
		execFileSync("tmux", ["select-window", "-t", `${session}:${windowIndex}`], {
			timeout: 3000,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "select-window failed";
		throw new TmuxWindowsError(message, 500);
	}
}
