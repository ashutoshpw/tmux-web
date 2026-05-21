export type ClientMessage =
	| { type: 'input'; data: string }
	| { type: 'resize'; cols: number; rows: number };

export interface PtyLike {
	write(data: string): void;
	resize(cols: number, rows: number): void;
}

export function handleClientMessage(raw: string | Buffer, ptyProcess: PtyLike): boolean {
	const data = typeof raw === 'string' ? raw : raw.toString('utf-8');

	let msg: ClientMessage;
	try {
		msg = JSON.parse(data);
	} catch {
		return false;
	}

	if (msg.type === 'input' && typeof msg.data === 'string') {
		ptyProcess.write(msg.data);
		return true;
	}

	if (
		msg.type === 'resize' &&
		typeof msg.cols === 'number' &&
		typeof msg.rows === 'number'
	) {
		ptyProcess.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
		return true;
	}

	return false;
}
