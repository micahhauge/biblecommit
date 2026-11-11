'use client';

import { localDate, weekOf } from '@biblecommit/core';
import { browserTimezone } from '@/guest';
import { useHasUser } from '@/session';
import { useToday } from '@/me';
import { SaveNudge } from './SaveNudge';
import styles from './Streak.module.css';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The streak number, today's status, and this week's dots (Sun–Sat). */
export function Streak() {
  const hasUser = useHasUser();
  const summary = useToday();

  // Before the first commit there is nothing to fetch: an empty week, locally.
  const data = hasUser
    ? summary.data
    : (() => {
        const today = localDate(new Date(), browserTimezone());
        return { today, streak: 0, committedToday: false, week: weekOf(today).map((date) => ({ date, committed: false })) };
      })();

  const status = !hasUser
    ? 'commit one passage to begin'
    : summary.error
      ? summary.error.message
      : data?.committedToday
        ? 'committed today'
        : data
          ? 'nothing committed yet today'
          : '';

  return (
    <section aria-labelledby="streak-heading">
      <h2 id="streak-heading">streak</h2>
      <div className={styles.row}>
        <div>
          <div className={styles.big} data-testid="streak">
            {data ? data.streak : '·'}
          </div>
          <div className={styles.sub}>
            day streak
            <br />
            <span data-testid="streak-status">{status}</span>
          </div>
        </div>
        <ol aria-label="this week" className={styles.week}>
          {(data?.week ?? []).map(({ date, committed }, i) => {
            const isToday = date === data?.today;
            const label = `${DAYS[i]}${isToday ? ' (today)' : ''}${committed ? ', committed' : ''}`;
            const cls = [styles.dot, committed && styles.read, isToday && styles.today].filter(Boolean).join(' ');
            return (
              <li key={date} aria-label={label} title={date}>
                <span className={cls} />
                <span aria-hidden="true">{DAYS[i]![0]}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <SaveNudge />
    </section>
  );
}
