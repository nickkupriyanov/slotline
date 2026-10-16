import { createMockAdapter, type BookingAdapter } from '@nickkupriyanov/slotline-core';

/**
 * The playground runs against the core's mock: a stable calendar, an injectable
 * clock and an idempotent create, so a reload of the page shows the same days.
 */
export const adapter: BookingAdapter = createMockAdapter({
  horizonDays: 90,
  timeZone: 'UTC',
  idempotentCreate: true,
  // What a real backend returns with a created record: the playground shows the
  // confirmation whole, including the links the application own.
  resultExtras: {
    location: 'Studio 2, Torstraße 14',
    instructions: 'Ring the bell twice and ask for Ann.',
    joinUrl: 'https://meet.example.com/slotline-demo',
    calendarUrl: 'https://calendar.example.com/slotline-demo.ics',
    rescheduleUrl: 'https://app.example.com/bookings/demo/reschedule',
    cancelUrl: 'https://app.example.com/bookings/demo/cancel',
  },
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
