/**
 * Schedule context helpers.
 *
 * A context identifies the schedule a booking belongs to. Until an application
 * supplies its own, the widget works against a single default schedule, so a
 * consumer that only integrates availability needs no extra configuration.
 */
import type { BookingContext } from './types';

/** Key of the implicit single schedule. */
export const DEFAULT_CONTEXT_KEY = 'default';

/** The context used when the application does not supply one. */
export const DEFAULT_BOOKING_CONTEXT: BookingContext = { key: DEFAULT_CONTEXT_KEY };

/** Reads the key of a context, falling back to the default schedule. */
export function contextKeyOf(context: BookingContext | undefined): string {
  return context?.key ?? DEFAULT_CONTEXT_KEY;
}
