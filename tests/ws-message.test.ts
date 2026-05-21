import { describe, expect, it, vi } from 'vitest';
import { handleClientMessage } from '../src/lib/ws-message.js';

describe('handleClientMessage', () => {
	it('writes terminal input escape sequences to the PTY unchanged', () => {
		const pty = { write: vi.fn(), resize: vi.fn() };
		const sequence = '\x1b[<65;3;3M';

		expect(handleClientMessage(JSON.stringify({ type: 'input', data: sequence }), pty)).toBe(true);
		expect(pty.write).toHaveBeenCalledWith(sequence);
		expect(pty.resize).not.toHaveBeenCalled();
	});

	it('clamps resize messages before resizing the PTY', () => {
		const pty = { write: vi.fn(), resize: vi.fn() };

		expect(handleClientMessage(JSON.stringify({ type: 'resize', cols: 1, rows: 1 }), pty)).toBe(true);
		expect(pty.resize).toHaveBeenCalledWith(10, 5);
		expect(pty.write).not.toHaveBeenCalled();
	});

	it('ignores invalid messages', () => {
		const pty = { write: vi.fn(), resize: vi.fn() };

		expect(handleClientMessage('{', pty)).toBe(false);
		expect(handleClientMessage(JSON.stringify({ type: 'input', data: 123 }), pty)).toBe(false);
		expect(pty.write).not.toHaveBeenCalled();
		expect(pty.resize).not.toHaveBeenCalled();
	});
});
