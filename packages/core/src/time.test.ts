import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTimeAnchor,
  isRetrySafe,
  midnightAfter,
  retryWindowClosesAt,
  soonestBoundary,
  systemClock,
  timeAnchorKey,
} from './time';
import type { BookingCapabilities } from './types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const idempotent = (retentionMs: number): BookingCapabilities => ({
  idempotentCreate: true,
  idempotencyRetentionMs: retentionMs,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('systemClock', () => {
  it('reads the wall clock', () => {
    const before = Date.now();
    const now = systemClock().now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('fires a scheduled callback and stops it when cancelled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    const clock = systemClock();
    const fired = vi.fn();
    const cancelled = vi.fn();

    const cancelFired = clock.schedule(Date.parse('2026-05-18T00:00:05Z'), fired);
    const cancelSecond = clock.schedule(Date.parse('2026-05-18T00:00:10Z'), cancelled);

    vi.advanceTimersByTime(4_999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();

    cancelSecond();
    vi.advanceTimersByTime(20_000);
    expect(cancelled).not.toHaveBeenCalled();
    cancelFired();
  });

  it('hops a far deadline, so a callback has to re-arm instead of trusting it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T00:00:00Z'));
    const fired = vi.fn();

    // 30 days out: longer than a single timeout can express, so the clock fires
    // early and the controller is expected to re-read the time and re-schedule.
    systemClock().schedule(Date.now() + 30 * DAY, fired);
    vi.advanceTimersByTime(2_147_483_647);

    expect(fired).toHaveBeenCalledTimes(1);
  });
});

describe('createTimeAnchor', () => {
  it('keeps the instant and derives the calendar day in the zone', () => {
    const nowMs = Date.parse('2026-05-17T20:00:00Z');

    expect(createTimeAnchor(nowMs, 'UTC')).toEqual({ nowMs, today: '2026-05-17' });
    expect(createTimeAnchor(nowMs, 'Europe/Berlin').today).toBe('2026-05-17');
    expect(createTimeAnchor(nowMs, 'Asia/Tokyo').today).toBe('2026-05-18');
  });
});

describe('midnightAfter', () => {
  it('returns the start of the next day in UTC', () => {
    expect(midnightAfter(Date.parse('2026-05-18T08:00:00Z'), 'UTC')).toBe(
      Date.parse('2026-05-19T00:00:00Z'),
    );
  });

  it('applies the zone offset, in both summer and winter', () => {
    expect(midnightAfter(Date.parse('2026-05-18T08:00:00Z'), 'Europe/Berlin')).toBe(
      Date.parse('2026-05-18T22:00:00Z'),
    );
    expect(midnightAfter(Date.parse('2026-01-15T08:00:00Z'), 'Europe/Berlin')).toBe(
      Date.parse('2026-01-15T23:00:00Z'),
    );
  });

  it('handles zones east and west of UTC', () => {
    expect(midnightAfter(Date.parse('2026-05-18T08:00:00Z'), 'Asia/Tokyo')).toBe(
      Date.parse('2026-05-18T15:00:00Z'),
    );
    expect(midnightAfter(Date.parse('2026-05-18T08:00:00Z'), 'America/New_York')).toBe(
      Date.parse('2026-05-19T04:00:00Z'),
    );
  });

  it('is strictly after an instant that already sits on local midnight', () => {
    // 2026-05-18T00:00 local in Berlin.
    const localMidnight = Date.parse('2026-05-17T22:00:00Z');

    expect(midnightAfter(localMidnight, 'Europe/Berlin')).toBe(Date.parse('2026-05-18T22:00:00Z'));
  });

  it('crosses the spring transition without losing an hour', () => {
    // DST starts on 2026-03-29 at 02:00 local: midnight of the 30th is +2, not +1.
    expect(midnightAfter(Date.parse('2026-03-29T12:00:00Z'), 'Europe/Berlin')).toBe(
      Date.parse('2026-03-29T22:00:00Z'),
    );
  });

  it('crosses the autumn transition without gaining an hour', () => {
    // DST ends on 2026-10-25 at 03:00 local: midnight of the 26th is +1.
    expect(midnightAfter(Date.parse('2026-10-25T12:00:00Z'), 'Europe/Berlin')).toBe(
      Date.parse('2026-10-25T23:00:00Z'),
    );
  });
});

describe('soonestBoundary', () => {
  it('picks the earliest moment still ahead', () => {
    expect(soonestBoundary(1_000, [5_000, 3_000, undefined])).toBe(3_000);
    expect(soonestBoundary(1_000, [undefined, 2_000])).toBe(2_000);
  });

  it('ignores moments already past and reports nothing when none is ahead', () => {
    expect(soonestBoundary(1_000, [1_000, 999, undefined])).toBeUndefined();
    expect(soonestBoundary(1_000, [])).toBeUndefined();
  });
});

describe('safe retry window', () => {
  const startedAt = Date.parse('2026-05-18T09:00:00Z');

  it('closes exactly one retention window after the attempt started', () => {
    expect(retryWindowClosesAt(startedAt, idempotent(HOUR))).toBe(startedAt + HOUR);
  });

  it('reports no window when the adapter promises nothing usable', () => {
    expect(retryWindowClosesAt(startedAt, undefined)).toBeUndefined();
    expect(retryWindowClosesAt(startedAt, { idempotentCreate: false })).toBeUndefined();
    expect(retryWindowClosesAt(startedAt, idempotent(0))).toBeUndefined();
    expect(retryWindowClosesAt(startedAt, idempotent(-1))).toBeUndefined();
    expect(retryWindowClosesAt(startedAt, idempotent(Number.NaN))).toBeUndefined();
  });

  it('is open before the boundary and closed on it', () => {
    const capabilities = idempotent(HOUR);

    expect(isRetrySafe(startedAt, capabilities, startedAt)).toBe(true);
    expect(isRetrySafe(startedAt, capabilities, startedAt + HOUR - 1)).toBe(true);
    expect(isRetrySafe(startedAt, capabilities, startedAt + HOUR)).toBe(false);
    expect(isRetrySafe(startedAt, capabilities, startedAt + HOUR + 1)).toBe(false);
  });

  it('refuses a repeat when the adapter declared no idempotent create', () => {
    expect(isRetrySafe(startedAt, undefined, startedAt + 1)).toBe(false);
    expect(isRetrySafe(startedAt, { idempotentCreate: false }, startedAt + 1)).toBe(false);
  });

  it('refuses a repeat when the clock contradicts the attempt', () => {
    // A restored attempt whose `startedAt` lies ahead of the clock must not read
    // as an endless window: it needs investigating, not retrying.
    expect(isRetrySafe(startedAt, idempotent(HOUR), startedAt - 1)).toBe(false);
  });
});

describe('timeAnchorKey', () => {
  const anchor = { nowMs: Date.parse('2026-05-18T09:00:00Z'), today: '2026-05-18' };

  it('ignores the part of the clock that moves constantly', () => {
    const later = { ...anchor, nowMs: anchor.nowMs + 5 * 60_000 };

    expect(timeAnchorKey(later, true)).toBe(timeAnchorKey(anchor, true));
  });

  it('changes with the calendar day and with the retry window', () => {
    expect(timeAnchorKey({ ...anchor, today: '2026-05-19' }, true)).not.toBe(
      timeAnchorKey(anchor, true),
    );
    expect(timeAnchorKey(anchor, false)).not.toBe(timeAnchorKey(anchor, true));
  });
});
