import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// A fixed wall clock and timezone, so "today" is deterministic for client and server alike.
// Only Date is faked; real timers keep React Query and user-event working.
process.env.TZ = 'America/Chicago';
export const NOW = new Date('2026-11-09T15:00:00Z'); // 9:00 in Chicago, Monday Nov 9

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  localStorage.clear();
  // jsdom has no matchMedia; default to a desktop (fine pointer). Tests can override.
  setPointer('fine');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Simulate a mouse (fine) or touch (coarse) device. */
export function setPointer(kind: 'fine' | 'coarse') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes(`pointer: ${kind}`) || (kind === 'fine' && query.includes('hover: hover')),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    onchange: null,
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
}
