'use client';

import { bucket, dayLabel, FIXED_THRESHOLDS, localDate, yearDays, type Thresholds } from '@biblecommit/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { browserTimezone, useHasGuest } from '@/guest';
import { useYear, type Year } from '@/me';
import styles from './YearHeatmap.module.css';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['', 'mon', '', 'wed', '', 'fri', ''];

// Layout, in SVG units: cells on a 14-unit grid, with room for weekday labels (left) and months (top).
const STEP = 14;
const CELL = 11;
const LEFT = 26;
const TOP = 16;

/** Before the first commit: this year, empty, without a request. */
function emptyYear(): Year {
  const today = localDate(new Date(), browserTimezone());
  return { today, days: yearDays(today).map((date) => ({ date, verses: 0 })), thresholds: [...FIXED_THRESHOLDS] };
}

function describe(date: string, verses: number, today: string) {
  return `${dayLabel(date, today)} · ${verses ? `${verses.toLocaleString()} verse${verses === 1 ? '' : 's'}` : 'nothing read'}`;
}

/**
 * The last 53 weeks, one wash cell per day, deeper for more verses read. Hover (or tap)
 * a day for its date and verse count. On narrow screens it scrolls sideways, opening on this month.
 */
export function YearHeatmap() {
  const hasGuest = useHasGuest();
  const year = useYear();
  const data = hasGuest ? year.data : emptyYear();
  const [active, setActive] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const loaded = !!data;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && loaded) el.scrollLeft = el.scrollWidth;
  }, [loaded]);

  const days = data?.days ?? [];
  const thresholds = (data?.thresholds ?? FIXED_THRESHOLDS) as Thresholds;
  const today = data?.today ?? '';
  const total = days.reduce((sum, d) => sum + d.verses, 0);
  const readDays = days.filter((d) => d.verses > 0).length;
  const weeks = Math.ceil(days.length / 7);

  const subtitle = year.error
    ? year.error.message
    : !data
      ? ''
      : readDays
        ? `${total.toLocaleString()} verses · ${readDays} day${readDays === 1 ? '' : 's'}`
        : 'your year begins today';

  const activeDay = active === null ? undefined : days[active];

  /** The day under a pointer event, from the cell's data-i. */
  const dayAt = (target: EventTarget) => {
    const i = target instanceof Element ? target.getAttribute('data-i') : null;
    return i === null ? null : Number(i);
  };

  const months: React.ReactNode[] = [];
  const cells: React.ReactNode[] = [];
  days.forEach(({ date, verses }, i) => {
    const week = Math.floor(i / 7);
    const dow = i % 7;
    const x = LEFT + week * STEP;
    const y = TOP + dow * STEP;
    // Label a month above the first week that starts in it.
    if (dow === 0 && Number(date.slice(8)) <= 7) {
      months.push(
        <text key={date} x={x} y={9}>
          {MONTHS[Number(date.slice(5, 7)) - 1]}
        </text>,
      );
    }
    // The rest of this week hasn't happened yet.
    if (date > today) return;
    const level = bucket(verses, thresholds);
    cells.push(
      <rect
        key={date}
        data-i={i}
        data-level={level}
        className={`${styles.c} ${styles[`l${level}`]}${date === today ? ` ${styles.today}` : ''}`}
        x={x}
        y={y}
        width={CELL}
        height={CELL}
        rx={2.4}
      >
        <title>{describe(date, verses, today)}</title>
      </rect>,
    );
  });

  return (
    <section aria-labelledby="year-heading">
      <h2 id="year-heading">
        the year <em data-testid="year-sub">{subtitle}</em>
      </h2>
      <div ref={scroller} className={styles.scroll}>
        <svg
          role="img"
          aria-label={`the last 53 weeks: ${subtitle}`}
          viewBox={`0 0 ${LEFT + weeks * STEP} ${TOP + 7 * STEP}`}
          onMouseOver={(e) => setActive(dayAt(e.target))}
          onMouseLeave={() => setActive(null)}
          onClick={(e) => setActive(dayAt(e.target))}
        >
          {months}
          {WEEKDAYS.map(
            (label, i) =>
              label && (
                <text key={label} x={0} y={TOP + i * STEP + 9}>
                  {label}
                </text>
              ),
          )}
          <g className={styles.cells}>{cells}</g>
        </svg>
      </div>
      <p className={styles.status} data-testid="year-status">
        {activeDay ? describe(activeDay.date, activeDay.verses, today) : ' '}
      </p>
    </section>
  );
}
