export interface TerminalBufferConfig {
	initialLines: number;
	historyChunk: number;
	syncIdleMs: number;
	syncMaxMs: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const n = parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readTerminalBufferConfig(): TerminalBufferConfig {
	return {
		initialLines: parsePositiveInt(process.env.TMUX_WEB_INITIAL_LINES, 1000),
		historyChunk: parsePositiveInt(process.env.TMUX_WEB_HISTORY_CHUNK, 500),
		syncIdleMs: parsePositiveInt(process.env.TMUX_WEB_SYNC_IDLE_MS, 200),
		syncMaxMs: parsePositiveInt(process.env.TMUX_WEB_SYNC_MAX_MS, 3000),
	};
}
