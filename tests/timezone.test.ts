import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, isValidTimeZone } from '../src/lib/timezone.js';

describe('timezone formatting', () => {
	it('validates IANA timezone names', () => {
		expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
		expect(isValidTimeZone('America/New_York')).toBe(true);
		expect(isValidTimeZone('UTC')).toBe(true);
		expect(isValidTimeZone('Not/A_Timezone')).toBe(false);
	});

	it('formats absolute timestamps in 24-hour time', () => {
		const timestamp = Date.UTC(2026, 6, 11, 12, 30);

		expect(formatAbsoluteTime(timestamp, 'Asia/Kolkata')).toBe('2026-07-11 18:00');
		expect(formatAbsoluteTime(timestamp, 'UTC')).toBe('2026-07-11 12:30');
	});

	it('honors daylight-saving transitions for regional timezones', () => {
		expect(formatAbsoluteTime(Date.UTC(2026, 0, 15, 16, 0), 'America/New_York')).toBe('2026-01-15 11:00');
		expect(formatAbsoluteTime(Date.UTC(2026, 6, 15, 16, 0), 'America/New_York')).toBe('2026-07-15 12:00');
	});
});
