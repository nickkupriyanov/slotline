import { createMockAdapter, type BookingAdapter } from '@nickkupriyanov/slotline-core';

/** A deterministic double: the check is about packaging, not about the backend. */
export const adapter: BookingAdapter = createMockAdapter({
  latency: 0,
  horizonDays: 60,
  timeZone: 'UTC',
  busyRatio: 0.2,
});
