/** The calendar date (YYYY-MM-DD) of an instant in an IANA timezone. */
export function localDate(instant: Date, timezone: string): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Whether a string is a timezone this runtime knows (IANA name). */
export function isTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Short label for a local date relative to today: "today", "yesterday", "nov 2", "dec 25, 2025". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const label = `${MONTHS[m - 1]} ${d}`;
  return date.slice(0, 4) === today.slice(0, 4) ? label : `${label}, ${y}`;
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
