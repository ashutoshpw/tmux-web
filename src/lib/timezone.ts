const ABSOLUTE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
};

export const INVALID_TIMEZONE_MESSAGE = 'Invalid timezone. Use an IANA timezone such as Asia/Kolkata, America/New_York, or UTC.';

/** Return whether a value is accepted by the runtime's IANA timezone database. */
export function isValidTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
		return true;
	} catch {
		return false;
	}
}

/** Format a timestamp as an unambiguous, 24-hour local date/time. */
export function formatAbsoluteTime(timestamp: number, timeZone?: string): string {
	const options: Intl.DateTimeFormatOptions = { ...ABSOLUTE_TIME_OPTIONS };
	if (timeZone && isValidTimeZone(timeZone)) options.timeZone = timeZone;

	const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(new Date(timestamp));
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}
