/**
 * The time the flow reasons about.
 *
 * Nothing in the core reads the wall clock directly: the controller holds a
 * `BookingTimeAnchor`, schedules work through an injectable `BookingClock`, and
 * passes both into the pure helpers here. That is what makes midnight, a time
 * zone change and the expiry of a safe-retry window testable without waiting.
 */
import { addDays, instantOfZonedTime, todayKey } from './date';
import type { BookingCapabilities, BookingClock, BookingTimeAnchor } from './types';

/**
 * Longest delay a single `setTimeout` can express. Anything later is scheduled in
 * hops, so a callback must always re-read the clock and re-arm rather than assume
 * the deadline it was given has arrived.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** The real clock. A binding hands this to the controller after mounting. */
export function systemClock(): BookingClock {
  return {
    now: () => Date.now(),
    schedule(atMs, callback) {
      const delay = Math.max(0, Math.min(atMs - Date.now(), MAX_TIMEOUT_MS));
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    },
  };
}

/** Fixes the time reference: `nowMs` plus the calendar day it falls on in the zone. */
export function createTimeAnchor(nowMs: number, timeZone: string): BookingTimeAnchor {
  return { nowMs, today: todayKey(timeZone, new Date(nowMs)) };
}

/** Start of the next day in `timeZone`, strictly after `nowMs`. */
export function midnightAfter(nowMs: number, timeZone: string): number {
  const today = todayKey(timeZone, new Date(nowMs));
  return instantOfZonedTime(addDays(today, 1), 0, timeZone).getTime();
}

/** The earliest candidate strictly after `nowMs`; past and missing ones are skipped. */
export function soonestBoundary(
  nowMs: number,
  candidates: readonly (number | undefined)[],
): number | undefined {
  let soonest: number | undefined;
  for (const candidate of candidates) {
    if (candidate === undefined || candidate <= nowMs) continue;
    if (soonest === undefined || candidate < soonest) soonest = candidate;
  }
  return soonest;
}

/**
 * The moment a safe retry stops being allowed, when the adapter promises one.
 *
 * `undefined` means the adapter declared no idempotent create (or declared an
 * unusable retention window), so repeating an unresolved attempt is never safe.
 */
export function retryWindowClosesAt(
  startedAt: number,
  capabilities: BookingCapabilities | undefined,
): number | undefined {
  if (!capabilities?.idempotentCreate) return undefined;
  const retention = capabilities.idempotencyRetentionMs;
  if (typeof retention !== 'number' || !Number.isFinite(retention) || retention <= 0) {
    return undefined;
  }
  return startedAt + retention;
}

/**
 * Whether repeating an attempt is still safe at `nowMs`.
 *
 * The window is half-open: on the boundary itself a repeat is already refused,
 * because the server's guarantee only covers the interval that ends there. An
 * attempt whose `startedAt` lies in the future is treated as unsafe rather than
 * as an infinite window.
 */
export function isRetrySafe(
  startedAt: number,
  capabilities: BookingCapabilities | undefined,
  nowMs: number,
): boolean {
  const closesAt = retryWindowClosesAt(startedAt, capabilities);
  return closesAt !== undefined && nowMs >= startedAt && nowMs < closesAt;
}

/**
 * The part of the time reference the rendered view depends on.
 *
 * `nowMs` moves constantly, so it must never take part in a snapshot cache key:
 * the view is a function of the calendar day in the zone and of whether the safe
 * retry window is still open. This key captures exactly those two facts.
 */
export function timeAnchorKey(anchor: BookingTimeAnchor, retryOpen: boolean): string {
  return `${anchor.today}|${retryOpen ? 'retry:open' : 'retry:closed'}`;
}
