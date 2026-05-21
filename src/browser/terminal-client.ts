import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

type TerminalBufferConfig = {
	initialLines: number;
	historyChunk: number;
	syncIdleMs: number;
	syncMaxMs: number;
};

type TerminalTheme = {
	foreground: string;
	background: string;
	cursor: string;
	cursorAccent: string;
	selectionBackground: string;
	selectionForeground: string;
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
};

type TerminalPageConfig = {
	sessionName: string;
	terminal: TerminalBufferConfig;
	scrollback: number;
	theme: TerminalTheme;
	renderer?: 'xterm' | 'ghostty';
};

type ServerMessage =
	| { type: 'snapshot'; data: string; lines: number }
	| { type: 'data'; data: string }
	| { type: 'history'; data: string; before: number; lines: number };

declare global {
	interface Window {
		__TMUX_WEB_TERMINAL__?: TerminalPageConfig;
	}
}

type TerminalAdapter = {
	readonly cols: number;
	readonly rows: number;
	write(data: string): Promise<void>;
	reset(): void;
	scrollToBottom(): void;
	scrollToLine(line: number): void;
	isNearScrollbackTop(): boolean;
	viewportY(): number;
	baseY(): number;
	fit(): boolean;
	focus(): void;
	pasteText(text: string): void;
	input(data: string): void;
	onData(callback: (data: string) => void): void;
	onResize(callback: (size: { cols: number; rows: number }) => void): void;
	onScroll(callback: () => void): void;
	attachCustomKeyEventHandler(callback: (event: KeyboardEvent) => boolean): void;
	isFocused(): boolean;
};

class XtermAdapter implements TerminalAdapter {
	private readonly terminal: Terminal;
	private readonly fitAddon = new FitAddon();
	private readonly container: HTMLElement;

	constructor(container: HTMLElement, scrollback: number, theme: TerminalTheme) {
		this.container = container;
		this.terminal = new Terminal({
			fontSize: 14,
			fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
			cursorBlink: true,
			cursorStyle: 'bar',
			scrollback,
			convertEol: false,
			theme,
		});
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(container);
	}

	get cols(): number {
		return this.terminal.cols;
	}

	get rows(): number {
		return this.terminal.rows;
	}

	write(data: string): Promise<void> {
		return new Promise((resolve) => this.terminal.write(data, resolve));
	}

	reset(): void {
		this.terminal.reset();
	}

	scrollToBottom(): void {
		this.terminal.scrollToBottom();
	}

	scrollToLine(line: number): void {
		this.terminal.scrollToLine(Math.max(0, line));
	}

	isNearScrollbackTop(): boolean {
		return this.terminal.buffer.active.viewportY <= 1;
	}

	viewportY(): number {
		return this.terminal.buffer.active.viewportY;
	}

	baseY(): number {
		return this.terminal.buffer.active.baseY;
	}

	fit(): boolean {
		const rect = getTerminalViewportRect(this.container);
		if (rect.width <= 0 || rect.height <= 0) return false;
		this.fitAddon.fit();
		return true;
	}

	focus(): void {
		this.terminal.focus();
	}

	pasteText(text: string): void {
		this.terminal.paste(text);
	}

	input(data: string): void {
		this.terminal.input(data, false);
	}

	onData(callback: (data: string) => void): void {
		this.terminal.onData(callback);
		this.terminal.onBinary(callback);
	}

	onResize(callback: (size: { cols: number; rows: number }) => void): void {
		this.terminal.onResize(callback);
	}

	onScroll(callback: () => void): void {
		this.terminal.onScroll(callback);
	}

	attachCustomKeyEventHandler(callback: (event: KeyboardEvent) => boolean): void {
		this.terminal.attachCustomKeyEventHandler(callback);
	}

	isFocused(): boolean {
		const active = document.activeElement;
		return !!active && (active === this.container || this.container.contains(active));
	}
}

class GhosttyAdapter implements TerminalAdapter {
	private readonly terminal: any;
	private readonly container: HTMLElement;
	private colsValue = 80;
	private rowsValue = 24;
	private charW = 0;
	private charH = 0;
	private resizeCallbacks: Array<(size: { cols: number; rows: number }) => void> = [];

	constructor(container: HTMLElement, terminal: any) {
		this.container = container;
		this.terminal = terminal;
		this.terminal.open(container);
	}

	static async create(container: HTMLElement, scrollback: number, theme: TerminalTheme): Promise<GhosttyAdapter> {
		const url = 'https://esm.sh/ghostty-web@latest';
		const mod = await import(url);
		await mod.init();
		const terminal = new mod.Terminal({
			fontSize: 14,
			fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
			cursorBlink: true,
			cursorStyle: 'bar',
			scrollback,
			convertEol: false,
			theme,
		});
		return new GhosttyAdapter(container, terminal);
	}

	get cols(): number {
		return this.colsValue;
	}

	get rows(): number {
		return this.rowsValue;
	}

	write(data: string): Promise<void> {
		return new Promise((resolve) => this.terminal.write(data, resolve));
	}

	reset(): void {
		this.terminal.reset();
	}

	scrollToBottom(): void {
		this.terminal.scrollToBottom?.();
	}

	scrollToLine(line: number): void {
		this.terminal.scrollToLine?.(Math.max(0, line));
	}

	isNearScrollbackTop(): boolean {
		const buf = this.terminal.buffer?.active;
		if (!buf) return false;
		return buf.viewportY >= buf.baseY;
	}

	viewportY(): number {
		return this.terminal.buffer?.active?.viewportY ?? 0;
	}

	baseY(): number {
		return this.terminal.buffer?.active?.baseY ?? 0;
	}

	fit(): boolean {
		const rect = getTerminalViewportRect(this.container);
		if (rect.width <= 0 || rect.height <= 0) return false;
		this.updateCellMetrics(!this.charW || !this.charH);
		const cols = Math.floor(rect.width / this.charW);
		const rows = Math.floor(rect.height / this.charH);
		if (cols < 10 || rows < 5) return false;
		if (cols !== this.colsValue || rows !== this.rowsValue) {
			this.colsValue = cols;
			this.rowsValue = rows;
			this.terminal.resize(cols, rows);
			for (const callback of this.resizeCallbacks) callback({ cols, rows });
		}
		return true;
	}

	focus(): void {
		const active = this.terminal.textarea || this.container.querySelector('textarea') || this.container;
		active?.focus?.();
	}

	pasteText(text: string): void {
		const bracketed = this.terminal.getMode?.(2004) ?? false;
		this.input(bracketed ? '\x1b[200~' + text + '\x1b[201~' : text);
	}

	input(data: string): void {
		this.terminal.input?.(data, false);
	}

	onData(callback: (data: string) => void): void {
		this.terminal.onData((data: string) => callback(data));
	}

	onResize(callback: (size: { cols: number; rows: number }) => void): void {
		this.resizeCallbacks.push(callback);
	}

	onScroll(callback: () => void): void {
		this.terminal.onScroll(callback);
	}

	attachCustomKeyEventHandler(callback: (event: KeyboardEvent) => boolean): void {
		this.terminal.attachCustomKeyEventHandler(callback);
	}

	isFocused(): boolean {
		const active = document.activeElement;
		return !!active && (active === this.container || active === this.terminal.textarea || this.container.contains(active));
	}

	private updateCellMetrics(force = false) {
		const canvas = this.container.querySelector('canvas');
		if (canvas instanceof HTMLElement && canvas.offsetWidth > 0 && canvas.offsetHeight > 0 && this.colsValue > 0 && this.rowsValue > 0) {
			const nextW = canvas.offsetWidth / this.colsValue;
			const nextH = canvas.offsetHeight / this.rowsValue;
			if (force || !this.charW || !this.charH) {
				this.charW = nextW;
				this.charH = nextH;
			}
		}
		if (!this.charW || !this.charH) {
			this.charW = 9;
			this.charH = 18;
		}
	}
}

const pageConfig = window.__TMUX_WEB_TERMINAL__;
if (!pageConfig) throw new Error('missing tmux-web terminal config');
const cfg: TerminalPageConfig = pageConfig;

const terminalContainer = document.getElementById('terminal-container');
if (!terminalContainer) throw new Error('missing terminal container');
const container: HTMLElement = terminalContainer;

const term: TerminalAdapter = cfg.renderer === 'ghostty'
	? await GhosttyAdapter.create(container, cfg.scrollback, cfg.theme)
	: new XtermAdapter(container, cfg.scrollback, cfg.theme);

let ws: WebSocket | undefined;
let fitRaf = 0;
let fitTimer: ReturnType<typeof setTimeout> | undefined;
let touchGesture: { startX: number; startY: number; lastX: number; lastY: number; scrolling: boolean } | null = null;
let suppressTouchClickUntil = 0;

let phase: 'connecting' | 'live' = 'connecting';
let serverHistoryLoaded = 0;
let historyLoading = false;
let historyParts: string[] = [];
let liveSuffix = '';

function fullLoadedText(): string {
	return historyParts.join('') + liveSuffix;
}

async function rewriteTerminal(preserveScroll: boolean, addedLines = 0) {
	const viewportY = preserveScroll ? term.viewportY() : 0;
	const baseY = preserveScroll ? term.baseY() : 0;
	const text = fullLoadedText();

	term.reset();
	if (!text) {
		if (!preserveScroll) term.scrollToBottom();
		return;
	}

	await term.write(text);
	if (preserveScroll) {
		term.scrollToLine(baseY + viewportY + addedLines);
	} else {
		term.scrollToBottom();
	}
}

function handleServerMessage(raw: string) {
	let msg: ServerMessage;
	try {
		msg = JSON.parse(raw) as ServerMessage;
	} catch {
		if (phase === 'live') {
			liveSuffix += raw;
			void term.write(raw);
		}
		return;
	}

	if (msg.type === 'snapshot' && typeof msg.data === 'string') {
		historyParts = [msg.data];
		liveSuffix = '';
		serverHistoryLoaded = typeof msg.lines === 'number' ? msg.lines : cfg.terminal.initialLines;
		phase = 'live';
		term.reset();
		void term.write(msg.data).then(() => term.scrollToBottom());
		return;
	}

	if (msg.type === 'history' && typeof msg.data === 'string') {
		historyLoading = false;
		if (msg.lines > 0 && msg.data) {
			historyParts.unshift(msg.data);
			serverHistoryLoaded += msg.lines;
			void rewriteTerminal(true, msg.lines);
		}
		return;
	}

	if (msg.type === 'data' && typeof msg.data === 'string') {
		if (phase === 'connecting') {
			phase = 'live';
			liveSuffix = msg.data;
			void term.write(msg.data);
			return;
		}
		if (phase === 'live') {
			liveSuffix += msg.data;
			void term.write(msg.data);
		}
	}
}

function getTerminalViewportRect(el: HTMLElement): { width: number; height: number } {
	const rect = el.getBoundingClientRect();
	const vv = window.visualViewport;
	if (!vv) return rect;
	return {
		width: Math.min(rect.width, vv.width),
		height: Math.max(0, Math.min(rect.height, vv.height - Math.max(0, rect.top))),
	};
}

function fitTerminal(): boolean {
	return term.fit();
}

function revealTerminal() {
	container.classList.remove('terminal-pending');
}

function scheduleFit() {
	if (fitRaf) cancelAnimationFrame(fitRaf);
	if (fitTimer) clearTimeout(fitTimer);
	fitTerminal();
	fitRaf = requestAnimationFrame(() => {
		fitRaf = 0;
		if (fitTerminal()) revealTerminal();
	});
	fitTimer = setTimeout(() => {
		if (fitTerminal()) revealTerminal();
	}, 120);
}

function scheduleKeyboardFit() {
	scheduleFit();
	setTimeout(scheduleFit, 50);
	setTimeout(scheduleFit, 150);
	setTimeout(scheduleFit, 300);
}

const dot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

function setConnected(ok: boolean) {
	if (dot) dot.className = 'dot' + (ok ? ' connected' : '');
	if (statusText) statusText.textContent = ok ? 'connected' : 'reconnecting';
}

const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = proto + '//' + location.host + '/ws/' + encodeURIComponent(cfg.sessionName);
const uploadUrl = '/api/session/' + encodeURIComponent(cfg.sessionName) + '/upload';
let reconnectDelay = 1000;
const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);

function sendJSON(obj: unknown) {
	if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
	ws = new WebSocket(wsUrl);
	ws.onopen = () => {
		phase = 'connecting';
		serverHistoryLoaded = 0;
		historyLoading = false;
		historyParts = [];
		liveSuffix = '';
		term.reset();
		setConnected(true);
		reconnectDelay = 1000;
		fitTerminal();
		sendJSON({ type: 'resize', cols: term.cols, rows: term.rows });
		scheduleFit();
	};
	ws.onmessage = (event) => {
		if (typeof event.data === 'string') handleServerMessage(event.data);
	};
	ws.onclose = () => {
		setConnected(false);
		phase = 'connecting';
		setTimeout(() => {
			reconnectDelay = Math.min(reconnectDelay * 2, 10000);
			connect();
		}, reconnectDelay);
	};
	ws.onerror = () => ws?.close();
}

function sendTerminalInput(data: string) {
	sendJSON({ type: 'input', data });
}

function pastePathToTerminal(filePath: string) {
	sendTerminalInput(filePath);
}

function normalizePasteText(text: string): string {
	return text.split('\r\n').join('\n').split('\n').join('\r');
}

function isImageMime(type: string | undefined): boolean {
	return typeof type === 'string' && type.startsWith('image/');
}

function getImageFileFromDataTransfer(dt: DataTransfer | null): File | null {
	if (!dt?.files?.length) return null;
	for (let i = 0; i < dt.files.length; i++) {
		if (isImageMime(dt.files[i]?.type)) return dt.files[i] ?? null;
	}
	return null;
}

function getImageFileFromClipboardData(cd: DataTransfer | null): File | null {
	if (!cd?.items) return null;
	for (let i = 0; i < cd.items.length; i++) {
		const item = cd.items[i];
		if (item?.kind === 'file' && isImageMime(item.type)) return item.getAsFile();
	}
	return null;
}

function setUploadStatus(msg: string | null) {
	if (msg && statusText) statusText.textContent = msg;
	else setConnected(ws?.readyState === WebSocket.OPEN);
}

async function uploadImageBlob(blob: Blob): Promise<string> {
	const fd = new FormData();
	fd.append('file', blob, 'upload');
	const res = await fetch(uploadUrl, { method: 'POST', body: fd });
	if (!res.ok) {
		let err = 'upload failed';
		try {
			const j = await res.json() as { error?: string };
			if (j.error) err = j.error;
		} catch {}
		throw new Error(err);
	}
	const j = await res.json() as { path?: string };
	if (!j.path) throw new Error('no path in response');
	return j.path;
}

async function ingestImageBlob(blob: Blob) {
	try {
		setUploadStatus('uploading...');
		const filePath = await uploadImageBlob(blob);
		pastePathToTerminal(filePath);
		setUploadStatus(null);
	} catch (e) {
		console.warn('image upload:', e);
		setUploadStatus('upload failed');
		setTimeout(() => setUploadStatus(null), 2000);
	}
}

term.onData((data) => sendTerminalInput(data));
term.onResize(({ cols, rows }) => sendJSON({ type: 'resize', cols, rows }));
term.onScroll(() => {
	if (phase !== 'live' || historyLoading || !term.isNearScrollbackTop()) return;
	historyLoading = true;
	sendJSON({ type: 'load_history', before: serverHistoryLoaded });
});

term.attachCustomKeyEventHandler((event) => {
	if (event.type !== 'keydown') return true;
	if ((event.ctrlKey || event.metaKey) && event.code === 'KeyV') {
		event.preventDefault();
		void (async () => {
			try {
				if (navigator.clipboard?.read) {
					const items = await navigator.clipboard.read();
					for (const item of items) {
						for (const type of item.types) {
							if (isImageMime(type)) {
								const blob = await item.getType(type);
								await ingestImageBlob(blob);
								return;
							}
						}
					}
				}
			} catch {}
			try {
				const text = await navigator.clipboard?.readText();
				if (text) term.pasteText(normalizePasteText(text));
			} catch {}
		})();
		return false;
	}
	return true;
});

let lastPasteAt = 0;
async function handlePasteEvent(event: ClipboardEvent) {
	const imageFile = getImageFileFromClipboardData(event.clipboardData);
	if (imageFile) {
		event.preventDefault();
		event.stopPropagation();
		const now = Date.now();
		if (now - lastPasteAt < 50) return;
		lastPasteAt = now;
		await ingestImageBlob(imageFile);
		return;
	}
	const text = event.clipboardData?.getData('text/plain');
	if (!text) return;
	event.preventDefault();
	event.stopPropagation();
	const now = Date.now();
	if (now - lastPasteAt < 50) return;
	lastPasteAt = now;
	term.pasteText(normalizePasteText(text));
}

container.addEventListener('paste', handlePasteEvent);

let terminalDragDepth = 0;
container.addEventListener('dragenter', (event) => {
	event.preventDefault();
	terminalDragDepth++;
	if (getImageFileFromDataTransfer(event.dataTransfer)) {
		container.classList.add('terminal-drag-over');
	}
});
container.addEventListener('dragover', (event) => {
	event.preventDefault();
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});
container.addEventListener('dragleave', (event) => {
	event.preventDefault();
	terminalDragDepth--;
	if (terminalDragDepth <= 0) {
		terminalDragDepth = 0;
		container.classList.remove('terminal-drag-over');
	}
});
container.addEventListener('drop', async (event) => {
	event.preventDefault();
	terminalDragDepth = 0;
	container.classList.remove('terminal-drag-over');
	const file = getImageFileFromDataTransfer(event.dataTransfer);
	if (file) await ingestImageBlob(file);
});

document.addEventListener('keydown', (event) => {
	if (!isSafari || event.key !== 'Escape') return;
	if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
	if (!term.isFocused()) return;
	event.preventDefault();
	event.stopPropagation();
	sendTerminalInput('\x1b');
}, true);

function dispatchTerminalWheel(deltaY: number, clientX: number, clientY: number) {
	const target: Element = container.querySelector('.xterm-screen') ?? container;
	target.dispatchEvent(new WheelEvent('wheel', {
		deltaY,
		deltaMode: WheelEvent.DOM_DELTA_PIXEL,
		clientX,
		clientY,
		bubbles: true,
		cancelable: true,
	}));
}

function focusTerminal() {
	term.focus();
	scheduleKeyboardFit();
}

container.addEventListener('touchstart', (event) => {
	if (event.touches.length !== 1) {
		touchGesture = null;
		return;
	}
	const touch = event.touches[0];
	if (!touch) return;
	touchGesture = { startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, scrolling: false };
	event.stopPropagation();
}, { passive: true, capture: true });

container.addEventListener('touchmove', (event) => {
	if (!touchGesture || event.touches.length !== 1) return;
	const touch = event.touches[0];
	if (!touch) return;
	const totalDy = touch.clientY - touchGesture.startY;
	const totalDx = touch.clientX - touchGesture.startX;
	if (!touchGesture.scrolling) {
		if (Math.abs(totalDy) < 8 || Math.abs(totalDy) < Math.abs(totalDx)) return;
		touchGesture.scrolling = true;
		suppressTouchClickUntil = Date.now() + 500;
	}
	event.preventDefault();
	event.stopPropagation();
	dispatchTerminalWheel(-(touch.clientY - touchGesture.lastY), touch.clientX, touch.clientY);
	touchGesture.lastX = touch.clientX;
	touchGesture.lastY = touch.clientY;
}, { passive: false, capture: true });

container.addEventListener('touchend', (event) => {
	if (!touchGesture) return;
	const wasScrolling = touchGesture.scrolling;
	touchGesture = null;
	event.stopPropagation();
	if (!wasScrolling) focusTerminal();
	else {
		suppressTouchClickUntil = Date.now() + 500;
		event.preventDefault();
	}
}, { passive: false, capture: true });

container.addEventListener('touchcancel', (event) => {
	touchGesture = null;
	event.stopPropagation();
}, { passive: true, capture: true });

container.addEventListener('pointerup', (event) => {
	if (event.pointerType === 'touch' && Date.now() < suppressTouchClickUntil) {
		event.preventDefault();
		event.stopPropagation();
	}
}, true);

window.addEventListener('resize', scheduleFit);
window.visualViewport?.addEventListener('resize', scheduleFit);
window.visualViewport?.addEventListener('scroll', scheduleFit);
new ResizeObserver(scheduleFit).observe(container);
document.fonts?.ready.then(() => {
	scheduleFit();
	setTimeout(scheduleFit, 50);
	setTimeout(scheduleFit, 200);
});
container.addEventListener('focusin', scheduleKeyboardFit, true);

requestAnimationFrame(() => {
	if (fitTerminal()) revealTerminal();
	connect();
	scheduleFit();
});
