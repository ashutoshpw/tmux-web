import { describe, expect, it } from 'vitest';
import { identifyAgent, detectState } from '../src/lib/agent-detect.js';

describe('identifyAgent', () => {
	it('matches agents by direct command name', () => {
		expect(identifyAgent('claude')).toBe('claude');
		expect(identifyAgent('codex')).toBe('codex');
		expect(identifyAgent('opencode')).toBe('opencode');
		expect(identifyAgent('cursor-agent')).toBe('cursor');
	});

	it('unwraps runtime launchers via descendant argv', () => {
		// Claude Code commonly shows up as a renamed node process; the real
		// identity is found by walking child process argv. The bin shim is
		// named after the binary, so the argv token basename is the agent name.
		expect(identifyAgent('node', ['node /Users/x/.bun/bin/claude'])).toBe('claude');
		expect(identifyAgent('2.1.138', ['claude'])).toBe('claude');
		expect(identifyAgent('node', ['node /opt/.codex-wrapped'])).toBe('codex');
	});

	it('returns null for non-agent panes', () => {
		expect(identifyAgent('zsh')).toBeNull();
		expect(identifyAgent('vim', ['vim file.txt'])).toBeNull();
		expect(identifyAgent('node')).toBeNull(); // runtime with no agent in argv
	});
});

describe('detectState', () => {
	const claudeIdle = [
		'  Once you drop the files, let me know what is missing.',
		'✻ Crunched for 40s',
		'────────────',
		"❯ I added the data, let me know what's missing",
		'────────────',
		'  Node: v22 arm64 accounting (main)',
	].join('\n');

	const claudeWorking = [
		'  Reading files...',
		'✻ Cogitating… (12s · esc to interrupt)',
		'❯',
	].join('\n');

	// Claude Code ≥2.1 dropped "(esc to interrupt)" from the spinner line; the
	// present-tense ellipsis spinner is the only working chrome left.
	const claudeWorkingNew = [
		'❯ Please count from 1 to 40',
		'✢ Scampering…',
		'────────────',
		'❯',
		'  Node: v22 arm64 tmux-web (main)',
	].join('\n');

	// The post-completion line persists on an idle screen — past tense, no
	// ellipsis — and must NOT read as working.
	const claudeDoneIdle = [
		'  40',
		'✻ Cogitated for 9s',
		'────────────',
		'❯',
	].join('\n');

	const claudeBlocked = [
		'Do you want to proceed?',
		'❯ 1. Yes',
		"  2. Yes, and don't ask again",
		'  3. No, and tell Claude what to do differently (esc)',
	].join('\n');

	it('classifies Claude states from live UI chrome only', () => {
		// "know"/"no" in the transcript must NOT trip the blocked detector.
		expect(detectState('claude', claudeIdle)).toBe('idle');
		expect(detectState('claude', claudeWorking)).toBe('working');
		expect(detectState('claude', claudeBlocked)).toBe('blocked');
	});

	it('classifies the post-2.1 Claude spinner (no interrupt hint)', () => {
		expect(detectState('claude', claudeWorkingNew)).toBe('working');
		expect(detectState('claude', '· Moseying…\n❯')).toBe('working');
		expect(detectState('claude', claudeDoneIdle)).toBe('idle');
	});

	it('classifies Codex states', () => {
		expect(detectState('codex', '  done.\n❯ type a message')).toBe('idle');
		expect(detectState('codex', '• Working (8s · esc to interrupt)\n❯')).toBe('working');
		expect(detectState('codex', 'Allow command?  rm -rf build\n❯ 1. Yes\n  2. No')).toBe('blocked');
	});

	it('classifies OpenCode states', () => {
		expect(detectState('opencode', '  Build done.\n  tab switch agent · • OpenCode 1.1.3')).toBe('idle');
		expect(detectState('opencode', '⠹ Generating response...\n  • OpenCode 1.1.3')).toBe('working');
	});

	it('classifies Cursor blocked menus', () => {
		expect(detectState('cursor', 'Run this command?\n❯ 1. Yes\n  2. No')).toBe('blocked');
		expect(detectState('cursor', '  ready.\n❯ ask anything')).toBe('idle');
	});
});
