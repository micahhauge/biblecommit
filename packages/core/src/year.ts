import { addDays } from './dates';
import { weekday } from './streak';

/** 53 weeks of days: the span of the year heatmap. */
export const YEAR_DAYS = 53 * 7;

/**
 * The heatmap's days: the 53 Sunday–Saturday weeks ending with the week that contains
 * `end` (YYYY-MM-DD), oldest first. Days after `end` in its week are included.
 */
export function yearDays(end: string): string[] {
  const saturday = addDays(end, 6 - weekday(end));
  const first = addDays(saturday, 1 - YEAR_DAYS);
  return Array.from({ length: YEAR_DAYS }, (_, i) => addDays(first, i));
}

/**
 * The fewest verses for buckets 1–4. A day with no verses is bucket 0.
 * Used while there are too few reading days for quantiles to mean anything.
 */
export const FIXED_THRESHOLDS: Thresholds = [1, 11, 31, 81];

/** Fewer reading days than this, and the fixed thresholds apply. */
const MIN_DAYS_FOR_QUANTILES = 8;

/** The fewest verses for intensity buckets 1, 2, 3, 4. Non-decreasing. */
export type Thresholds = [number, number, number, number];

/**
 * Intensity thresholds from a window of daily verse totals (repeats counted).
 *
 * The nonzero days are split into quartiles, so the buckets follow the reader's own
 * history and light reading days still show. With fewer than 8 nonzero days the
 * fixed thresholds (1–10 / 11–30 / 31–80 / 81+) apply.
 */
export function bucketThresholds(totals: Iterable<number>): Thresholds {
  const read = [...totals].filter((v) => v > 0).sort((a, b) => a - b);
  if (read.length < MIN_DAYS_FOR_QUANTILES) return [...FIXED_THRESHOLDS];
  // The top of each of the lower three quartiles; the next bucket starts just above it.
  const top = (p: number) => read[Math.floor(p * (read.length - 1))]!;
  return [1, top(0.25) + 1, top(0.5) + 1, top(0.75) + 1];
}

/** A day's intensity bucket, 0 (nothing read) to 4. */
export function bucket(verses: number, thresholds: Thresholds): 0 | 1 | 2 | 3 | 4 {
  let level = 0;
  while (level < 4 && verses >= thresholds[level]!) level++;
  return level as 0 | 1 | 2 | 3 | 4;
}
