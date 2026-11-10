import { describe, expect, it } from 'vitest';
import { dayLabel, isTimezone, localDate } from './dates';

describe('localDate', () => {
  // 03:00 UTC on Nov 10 is 21:00 Nov 9 in Chicago (CST, UTC-6) and 12:00 Nov 10 in Tokyo
  const instant = new Date('2026-11-10T03:00:00Z');

  it('is the calendar date in the given timezone', () => {
    expect(localDate(instant, 'America/Chicago')).toBe('2026-11-09');
    expect(localDate(instant, 'Asia/Tokyo')).toBe('2026-11-10');
    expect(localDate(instant, 'UTC')).toBe('2026-11-10');
  });
});

describe('isTimezone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isTimezone('America/Chicago')).toBe(true);
    expect(isTimezone('UTC')).toBe(true);
    expect(isTimezone('Mars/Olympus')).toBe(false);
    expect(isTimezone('')).toBe(false);
  });
});

describe('dayLabel', () => {
  const today = '2026-11-09';
  it.each([
    ['2026-11-09', 'today'],
    ['2026-11-08', 'yesterday'],
    ['2026-11-02', 'nov 2'],
    ['2026-03-01', 'mar 1'],
    ['2025-12-25', 'dec 25, 2025'],
  ])('%s → %s', (date, label) => {
    expect(dayLabel(date, today)).toBe(label);
  });

  it('handles yesterday across a month boundary', () => {
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('yesterday');
  });
});
