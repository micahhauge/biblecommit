import { describe, expect, it } from 'vitest';
import { bucket, bucketThresholds, FIXED_THRESHOLDS, YEAR_DAYS, yearDays } from './year';

describe('yearDays', () => {
  it('is 53 Sunday–Saturday weeks ending with the week of `end`', () => {
    // Monday, Nov 9 2026: its week ends Saturday, Nov 14.
    const days = yearDays('2026-11-09');
    expect(days).toHaveLength(YEAR_DAYS);
    expect(YEAR_DAYS).toBe(371);
    expect(days[0]).toBe('2025-11-09'); // a Sunday
    expect(days.at(-1)).toBe('2026-11-14');
    expect(new Set(days).size).toBe(371);
  });

  it('ends on `end` itself when it is a Saturday', () => {
    expect(yearDays('2026-11-14').at(-1)).toBe('2026-11-14');
    expect(yearDays('2026-11-15')[0]).toBe('2025-11-16');
  });
});

describe('bucketThresholds', () => {
  it('uses the fixed thresholds with fewer than 8 reading days', () => {
    expect(FIXED_THRESHOLDS).toEqual([1, 11, 31, 81]);
    expect(bucketThresholds([])).toEqual(FIXED_THRESHOLDS);
    expect(bucketThresholds([0, 0, 5, 200, 3, 0, 1, 1, 1])).toEqual(FIXED_THRESHOLDS);
  });

  it('splits the reading days into quartiles once there are 8', () => {
    // Nonzero days 1..8: buckets {1,2} {3,4} {5,6} {7,8}. Zeros are ignored.
    const t = bucketThresholds([0, 8, 3, 0, 1, 7, 5, 2, 6, 4, 0]);
    expect(t).toEqual([1, 3, 5, 7]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((v) => bucket(v, t))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('lets light readers show their light days', () => {
    // Someone who reads a handful of verses a day still spans all four buckets.
    const t = bucketThresholds([2, 3, 3, 4, 5, 5, 6, 9, 12]);
    expect(bucket(2, t)).toBe(1);
    expect(bucket(12, t)).toBe(4);
    // Under the fixed thresholds all of these would be bucket 1.
    expect(bucket(9, FIXED_THRESHOLDS)).toBe(1);
  });

  it('stays non-decreasing when days tie', () => {
    const t = bucketThresholds(Array(10).fill(22));
    expect(t).toEqual([1, 23, 23, 23]);
    expect(bucket(22, t)).toBe(1);
  });
});

describe('bucket', () => {
  it('is 0 for a day with nothing read, else the highest bucket reached', () => {
    expect(bucket(0, FIXED_THRESHOLDS)).toBe(0);
    expect(bucket(1, FIXED_THRESHOLDS)).toBe(1);
    expect(bucket(10, FIXED_THRESHOLDS)).toBe(1);
    expect(bucket(11, FIXED_THRESHOLDS)).toBe(2);
    expect(bucket(30, FIXED_THRESHOLDS)).toBe(2);
    expect(bucket(31, FIXED_THRESHOLDS)).toBe(3);
    expect(bucket(80, FIXED_THRESHOLDS)).toBe(3);
    expect(bucket(81, FIXED_THRESHOLDS)).toBe(4);
    expect(bucket(5000, FIXED_THRESHOLDS)).toBe(4);
  });
});
