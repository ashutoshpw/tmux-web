import { execFileSync } from "node:child_process";

const TMUX_TIMEOUT_MS = 3000;

function tmux(args: string[]): string {
	return execFileSync("tmux", args, {
		encoding: "utf-8",
		timeout: TMUX_TIMEOUT_MS,
	}).trimEnd();
}

/** Active window's active pane for a session, e.g. `mysession:0.1`. */
export function getSessionPaneTarget(sessionName: string): string {
	return tmux([
		"display-message",
		"-p",
		"-t",
		sessionName,
		"#{session_name}:#{window_index}.#{pane_index}",
	]);
}

/** Lines in the pane scrollback history (not including visible screen). */
export function getPaneHistorySize(target: string): number {
	const raw = tmux(["display-message", "-p", "-t", target, "#{history_size}"]);
	const n = parseInt(raw, 10);
	return Number.isFinite(n) ? n : 0;
}

export function isAlternateScreen(target: string): boolean {
	return tmux(["display-message", "-p", "-t", target, "#{alternate_on}"]) === "1";
}

/**
 * Capture pane text between tmux line indices.
 * Negative indices refer to scrollback; omit `end` to capture through the visible pane end.
 */
export function capturePaneLines(target: string, start: number, end?: number): string {
	const args = ["capture-pane", "-t", target, "-p", "-S", String(start)];
	if (end !== undefined) args.push("-E", String(end));
	return tmux(args);
}

/** Last `lines` lines of history plus the visible pane. */
export function capturePaneTail(target: string, lines: number): string {
	return capturePaneLines(target, -lines);
}

/**
 * Older history chunk: lines immediately above what is already loaded.
 * `alreadyLoaded` = history lines already sent (snapshot + prior chunks).
 */
export function capturePaneHistoryChunk(
	target: string,
	alreadyLoaded: number,
	chunk: number,
): { data: string; lines: number } {
	const historySize = getPaneHistorySize(target);
	if (alreadyLoaded >= historySize) {
		return { data: "", lines: 0 };
	}

	const start = -(alreadyLoaded + chunk);
	const end = -(alreadyLoaded + 1);
	let data = capturePaneLines(target, start, end);

	// Trim if tmux returned fewer lines than requested (start of history).
	const lineCount = data === "" ? 0 : data.split("\n").length;
	const actual = Math.min(chunk, lineCount, historySize - alreadyLoaded);
	if (actual < lineCount && actual > 0) {
		data = data.split("\n").slice(-actual).join("\n");
	}

	return { data, lines: actual };
}
