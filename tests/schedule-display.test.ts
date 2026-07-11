import { describe, expect, it } from 'vitest';
import { renderScheduleIndex } from '../src/lib/pages/schedule-index.js';
import { renderSettings } from '../src/lib/pages/settings.js';
import { vscodeTheme } from '../src/lib/themes/index.js';

const task = {
	id: 'task-1',
	sessionName: 'deploy',
	windowIndex: 2,
	text: 'terraform apply',
	fireAt: Date.UTC(2026, 6, 11, 12, 30),
	createdAt: Date.UTC(2026, 6, 11, 12, 0),
	remainingMs: 30 * 60 * 1000,
};

describe('schedule display', () => {
	it('renders countdown mode and the absolute-time toggle by default', () => {
		const html = renderScheduleIndex([task], [], vscodeTheme);

		expect(html).toContain('aria-pressed="false"');
		expect(html).toContain('Show absolute time');
		expect(html).toContain('data-timestamp="1783773000000"');
		expect(html).toContain('let absoluteMode = false;');
	});

	it('renders configured absolute-time defaults and timezone metadata', () => {
		const html = renderScheduleIndex([task], [], vscodeTheme, 7, false, [], false, 'Asia/Kolkata', true);

		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('Show countdown');
		expect(html).toContain('DISPLAY_TIME_ZONE = "Asia/Kolkata"');
		expect(html).toContain('2026-07-11 18:00');
		expect(html).toContain('let absoluteMode = true;');
	});
});

describe('settings schedule display fields', () => {
	it('renders the configured timezone and default display mode', () => {
		const html = renderSettings({
			settings: {
				scheduleTimezone: 'Asia/Kolkata',
				scheduleAbsoluteTime: true,
			},
			renderer: 'xterm',
			rendererOverridden: false,
			theme: vscodeTheme,
			plugins: [],
		});

		expect(html).toContain('name="scheduleTimezone" value="Asia/Kolkata"');
		expect(html).toContain('name="scheduleAbsoluteTime" checked');
	});
});
