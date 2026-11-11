import { describe, expect, it } from 'vitest';
import { streak, weekOf, weekday } from './streak';

// Monday, Nov 9 2026
const today = '2026-11-09';

describe('streak', () => {
  it('is zero with no history', () => {
    expect(streak([], today)).toEqual({ length: 0, committedToday: false });
  });

  it('counts today when today has a commit', () => {
    expect(streak(['2026-11-09'], today)).toEqual({ length: 1, committedToday: true });
    expect(streak(['2026-11-07', '2026-11-08', '2026-11-09'], today)).toEqual({ length: 3, committedToday: true });
  });

  it('treats today as pending, not missed: the run can end yesterday', () => {
    expect(streak(['2026-11-07', '2026-11-08'], today)).toEqual({ length: 2, committedToday: false });
  });

  it('is broken by one missed day', () => {
    // Nov 6 missed: only Nov 7–9 count.
    expect(streak(['2026-11-04', '2026-11-05', '2026-11-07', '2026-11-08', '2026-11-09'], today).length).toBe(3);
    // Yesterday missed and today pending: nothing.
    expect(streak(['2026-11-06', '2026-11-07'], today)).toEqual({ length: 0, committedToday: false });
  });

  it('lets a backdated commit fill a missed day and rejoin the run', () => {
    const days = ['2026-11-05', '2026-11-06', '2026-11-08', '2026-11-09'];
    expect(streak(days, today).length).toBe(2);
    expect(streak([...days, '2026-11-07'], today).length).toBe(5);
  });

  it('ignores order, duplicates, and days after today', () => {
    expect(streak(['2026-11-09', '2026-11-08', '2026-11-09', '2026-11-10'], today)).toEqual({ length: 2, committedToday: true });
  });

  it('runs across month and year boundaries', () => {
    expect(streak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01').length).toBe(3);
    expect(streak(['2028-02-28', '2028-02-29'], '2028-03-01')).toEqual({ length: 2, committedToday: false });
  });
});

describe('weekOf', () => {
  it('is Sunday through Saturday around the date', () => {
    const week = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
    expect(weekOf('2026-11-09')).toEqual(week);
    expect(weekOf('2026-11-08')).toEqual(week);
    expect(weekOf('2026-11-14')).toEqual(week);
  });

  it('spans a month boundary', () => {
    expect(weekOf('2026-12-01')[0]).toBe('2026-11-29');
  });
});

describe('weekday', () => {
  it('is 0 for Sunday', () => {
    expect(weekday('2026-11-08')).toBe(0);
    expect(weekday('2026-11-14')).toBe(6);
  });
});
