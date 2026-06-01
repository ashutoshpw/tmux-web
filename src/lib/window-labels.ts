import { db, type WindowLabelRecord } from './db.js';

export function listWindowLabels(sessionName: string): WindowLabelRecord[] {
	return (db.data.windowLabels ?? []).filter((record) => record.sessionName === sessionName);
}

export async function setWindowLabel(
	sessionName: string,
	windowIndex: number,
	label: string,
): Promise<WindowLabelRecord[]> {
	const labels = db.data.windowLabels ??= [];
	const trimmed = label.trim();
	const idx = labels.findIndex(
		(record) => record.sessionName === sessionName && record.windowIndex === windowIndex,
	);

	if (!trimmed) {
		// Clearing the label reverts the window to its real tmux name.
		if (idx >= 0) {
			labels.splice(idx, 1);
			await db.write();
		}
		return listWindowLabels(sessionName);
	}

	const now = Date.now();
	if (idx >= 0) {
		labels[idx].label = trimmed;
		labels[idx].updatedAt = now;
	} else {
		labels.push({ sessionName, windowIndex, label: trimmed, updatedAt: now });
	}
	await db.write();
	return listWindowLabels(sessionName);
}
