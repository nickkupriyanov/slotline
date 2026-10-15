import { createMockAdapter, type BookingAdapter } from '@nickkupriyanov/slotline-core';

/**
 * The playground runs against the core's mock: a stable calendar, an injectable
 * clock and an idempotent create, so a reload of the page shows the same days.
 */
export const adapter: BookingAdapter = createMockAdapter({
  horizonDays: 90,
  timeZone: 'UTC',
  idempotentCreate: true,
});

/**
 * The same calendar, but the first creation answers with an unknown outcome — the
 * state the gallery's fourth panel has to show, and the one a safe retry exists for.
 */
export const unknownOutcomeAdapter: BookingAdapter = createMockAdapter({
  horizonDays: 90,
  timeZone: 'UTC',
  idempotentCreate: true,
  createBookingFailures: [{ code: 'UNKNOWN_OUTCOME' }],
});
