import { addDays } from './dates';

export interface Streak {
  /** Consecutive days with a commit, ending today (or yesterday while today is pending). */
  length: number;
  /** Whether today already has a commit. */
  committedToday: boolean;
}

/**
 * The streak as of `today`, from the local dates (YYYY-MM-DD) that have at least one commit.
 * Order and duplicates don't matter; dates after `today` are ignored.
 *
 * Today without a commit is pending, not missed: the run can end yesterday. Any other
 * day without a commit breaks it. There are no rest days.
 */
export function streak(days: Iterable<string>, today: string): Streak {
  const read = new Set(days);
  const committedToday = read.has(today);
  let day = committedToday ? today : addDays(today, -1);
  let length = 0;
  while (read.has(day)) {
    length++;
    day = addDays(day, -1);
  }
  return { length, committedToday };
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The seven dates (Sunday through Saturday) of the week containing `date`. */
export function weekOf(date: string): string[] {
  const sunday = addDays(date, -weekday(date));
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}
