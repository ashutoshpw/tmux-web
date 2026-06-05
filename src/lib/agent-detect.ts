/**
 * Heuristic AI-agent detection, ported from the approach in
 * `ogulcancelik/herdr` (src/detect.rs):
 *   1. Identify *which* agent is running from the pane's foreground process
 *      (unwrapping node/bun/python launchers).
 *   2. Classify its *state* by substring-matching the tail of the pane's
 *      screen buffer against known UI chrome.
 *
 * All matching is plain substring / line inspection — no regex engines, no
 * allocation-heavy work — so it stays cheap to run per poll.
 */

export type Agent = 'claude' | 'codex' | 'opencode' | 'cursor' | 'droid' | 'copilot';
export type AgentState = 'idle' | 'working' | 'blocked' | 'unknown';

export const AGENT_LABELS: Record<Agent, string> = {
	claude: 'Claude Code',
	codex: 'Codex',
	opencode: 'OpenCode',
	cursor: 'Cursor Agent',
	droid: 'Droid',
	copilot: 'GitHub Copilot',
};

// Process names that are launchers/runtimes rather than the agent itself.
// When the pane's current command is one of these we must inspect argv to find
// the real agent (e.g. Claude Code runs as `node .../cli.js`).
const RUNTIME_NAMES = new Set([
	'node', 'nodejs', 'bun', 'deno', 'python', 'python3', 'ruby',
	'sh', 'bash', 'zsh', 'fish', 'env', 'npx', 'bunx', 'tmux',
]);

/** Reduce a path/argv token to a comparable basename (strip dir, ext, wrappers). */
function tokenBasename(token: string): string {
	let t = token.trim();
	if (!t) return '';
	// Drop everything up to the last path separator.
	const slash = t.lastIndexOf('/');
	if (slash >= 0) t = t.slice(slash + 1);
	t = t.toLowerCase();
	// Nix / packaging wrappers: ".claude-code-wrapped" -> "claude-code".
	if (t.startsWith('.')) t = t.slice(1);
	t = t.replace(/-wrapped$/, '');
	// Script extensions.
	t = t.replace(/\.(c|m)?js$/, '').replace(/\.py$/, '');
	return t;
}

/** Map a normalized basename to an Agent, or null. */
function agentFromBasename(name: string): Agent | null {
	switch (name) {
		case 'claude':
		case 'claude-code':
			return 'claude';
		case 'codex':
		case 'codex-cli':
			return 'codex';
		case 'opencode':
		case 'open-code':
			return 'opencode';
		case 'cursor':
		case 'cursor-agent':
		case 'agent':
			return 'cursor';
		case 'droid':
			return 'droid';
		case 'copilot':
		case 'github-copilot':
		case 'gh-copilot':
			return 'copilot';
		default:
			return null;
	}
}

/**
 * Identify the agent from the pane's foreground command and (optionally) the
 * full argv of it and its descendant processes. Returns null for non-agent panes.
 */
export function identifyAgent(command: string, argvTexts: string[] = []): Agent | null {
	const direct = agentFromBasename(tokenBasename(command));
	if (direct) return direct;

	const isRuntime = RUNTIME_NAMES.has(tokenBasename(command));
	// Even if the command isn't a known runtime, scanning argv is harmless and
	// catches odd launchers — but only bother when we have argv to look at.
	if (!isRuntime && argvTexts.length === 0) return null;

	for (const text of argvTexts) {
		for (const token of text.split(/\s+/)) {
			const a = agentFromBasename(tokenBasename(token));
			if (a) return a;
		}
	}
	return null;
}

// ── State detection ──────────────────────────────────────────────────────────
//
// Detection only inspects the *live UI region* (the bottom non-blank lines of
// the visible screen), never the whole scrollback. The conversation transcript
// is full of words like "yes", "no", "approve", "do you want" that would
// produce constant false positives if matched globally. The reliable signals
// are structural UI chrome that an agent renders ONLY in a given state:
//   • working → the footer hint "esc to interrupt" / "ctrl+c to interrupt",
//     or (Claude Code ≥2.1, which dropped the hint) a present-tense spinner
//     line ("✢ Scampering…").
//   • blocked → a selection menu with the cursor on a numbered option ("❯ 1. Yes").
// Both live in the footer/prompt box at the bottom of the screen.
//
// Streaming-response phases render no chrome at all, so substring heuristics
// alone report 'idle' there; the probe layer (agents-watch) compensates with
// screen-delta detection between polls.

const LIVE_REGION_LINES = 20;

// Spinner glyphs used by agents' "thinking" animations (braille handled separately).
const SPINNER_GLYPHS = '⬡⬢◐◑◒◓◴◵◶◷';

function isBrailleChar(ch: string): boolean {
	const code = ch.codePointAt(0) ?? 0;
	return code >= 0x2800 && code <= 0x28ff;
}

/** Bottom non-blank lines of the screen — the agent's live status/prompt area. */
function liveLines(screen: string): string[] {
	const nonblank = screen.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
	return nonblank.slice(-LIVE_REGION_LINES);
}

/** Footer hint shown only while a generation is interruptible => working. */
function hasInterruptHint(liveLower: string): boolean {
	return (
		liveLower.includes('esc to interrupt') ||
		liveLower.includes('ctrl+c to interrupt') ||
		liveLower.includes('ctrl-c to interrupt')
	);
}

/**
 * A selection menu with the cursor on a numbered option, e.g. "❯ 1. Yes" or
 * "> 2. No, keep planning". This is what agents render when blocking for a
 * choice, and it does not occur in a normal input prompt (where ❯ precedes
 * free text, not "<digit>.").
 */
function hasSelectionMenu(lines: string[]): boolean {
	return lines.some((l) => /[❯>›]\s*\d+\.\s+\S/.test(l));
}

/** A braille/spinner glyph leading a line within the live region => animating. */
function hasSpinnerActivity(lines: string[]): boolean {
	for (const raw of lines) {
		const line = raw.trimStart();
		if (line.length < 2) continue;
		const ch = line[0];
		if (isBrailleChar(ch) || SPINNER_GLYPHS.includes(ch)) return true;
	}
	return false;
}

/**
 * Claude Code's present-tense spinner line, e.g. "✢ Scampering…" or
 * "· Moseying…" — rendered ONLY while generating. Since ~2.1 the
 * "(esc to interrupt)" hint is gone from this line, so the spinner itself is
 * the working signal. The persistent post-completion line ("✻ Cogitated for
 * 9s") carries no ellipsis, so requiring the … avoids matching it; the old
 * format ("✻ Cogitating… (12s · esc to interrupt)") still matches.
 */
function hasActiveSpinnerLine(lines: string[]): boolean {
	return lines.some((l) => /^[·✢✳✶✻✽*] \S.*…/.test(l));
}

function detectClaude(lines: string[], liveLower: string): AgentState {
	// Explicit permission phrasing or a numbered choice menu.
	if (
		hasSelectionMenu(lines) ||
		liveLower.includes('waiting for permission') ||
		liveLower.includes('do you want to proceed') ||
		liveLower.includes('do you want to make this edit') ||
		liveLower.includes('do you want to create')
	) {
		return 'blocked';
	}
	// The done-line ("✻ Crunched for 40s") persists after completion, so bare
	// spinner glyphs are NOT a reliable working signal — the interrupt hint
	// (old UI) or an ellipsis spinner line (new UI) is.
	if (hasInterruptHint(liveLower) || hasActiveSpinnerLine(lines)) return 'working';
	return 'idle';
}

function detectCodex(lines: string[], liveLower: string): AgentState {
	if (
		hasSelectionMenu(lines) ||
		liveLower.includes('press enter to confirm or esc to cancel') ||
		liveLower.includes('enter to submit answer') ||
		liveLower.includes('allow command?') ||
		liveLower.includes('[y/n]')
	) {
		return 'blocked';
	}
	if (hasInterruptHint(liveLower) || liveLower.includes('• working (')) return 'working';
	return 'idle';
}

function detectOpenCode(lines: string[], liveLower: string): AgentState {
	if (
		hasSelectionMenu(lines) ||
		liveLower.includes('[y/n]') ||
		liveLower.includes('(y/n)') ||
		liveLower.includes('allow this')
	) {
		return 'blocked';
	}
	if (hasInterruptHint(liveLower) || hasSpinnerActivity(lines)) return 'working';
	return 'idle';
}

function detectCursor(lines: string[], liveLower: string): AgentState {
	if (
		hasSelectionMenu(lines) ||
		liveLower.includes('run this command?') ||
		liveLower.includes('[y/n]') ||
		liveLower.includes('(y) (enter)')
	) {
		return 'blocked';
	}
	if (hasInterruptHint(liveLower) || hasSpinnerActivity(lines)) return 'working';
	return 'idle';
}

function detectDroid(lines: string[], liveLower: string): AgentState {
	if (
		hasSelectionMenu(lines) ||
		liveLower.includes('[y/n]') ||
		liveLower.includes('(y/n)') ||
		liveLower.includes('allow this') ||
		liveLower.includes('do you want')
	) {
		return 'blocked';
	}
	if (hasInterruptHint(liveLower) || hasSpinnerActivity(lines)) return 'working';
	return 'idle';
}

function detectCopilot(lines: string[], liveLower: string): AgentState {
	if (
		hasSelectionMenu(lines) ||
		liveLower.includes('[y/n]') ||
		liveLower.includes('(y/n)') ||
		liveLower.includes('allow command') ||
		liveLower.includes('do you want')
	) {
		return 'blocked';
	}
	if (hasInterruptHint(liveLower) || hasSpinnerActivity(lines)) return 'working';
	return 'idle';
}

/**
 * Classify the agent's current state from the captured screen.
 * Falls back to 'unknown' for unrecognized agents.
 */
export function detectState(agent: Agent, screen: string): AgentState {
	const lines = liveLines(screen);
	const liveLower = lines.join('\n').toLowerCase();
	switch (agent) {
		case 'claude': return detectClaude(lines, liveLower);
		case 'codex': return detectCodex(lines, liveLower);
		case 'opencode': return detectOpenCode(lines, liveLower);
		case 'cursor': return detectCursor(lines, liveLower);
		case 'droid': return detectDroid(lines, liveLower);
		case 'copilot': return detectCopilot(lines, liveLower);
		default: return 'unknown';
	}
}
