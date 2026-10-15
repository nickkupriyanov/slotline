/**
 * The error contract between an adapter and the flow.
 *
 * An adapter throws `BookingError` to state *what it knows*: every category
 * except `UNKNOWN_OUTCOME` is a guarantee that the booking was not created.
 * Anything else an adapter throws is normalised to the fallback category chosen
 * by the caller, which for a creation request is `UNKNOWN_OUTCOME`.
 */
import type { BookingErrorCode } from './types';

/** Every code, in the order of the specification table. */
export const BOOKING_ERROR_CODES: readonly BookingErrorCode[] = [
  'SLOT_UNAVAILABLE',
  'VALIDATION_FAILED',
  'TEMPORARY_FAILURE',
  'GENERIC_FAILURE',
  'UNKNOWN_OUTCOME',
  'ADAPTER_CONTRACT_VIOLATION',
];

const CODE_SET: ReadonlySet<string> = new Set<string>(BOOKING_ERROR_CODES);

export interface BookingErrorOptions {
  code: BookingErrorCode;
  message: string;
  /** Server-side validation messages, keyed by field name. */
  fieldErrors?: Record<string, string>;
  cause?: unknown;
}

/**
 * Thrown by an adapter to classify a failure.
 *
 * Use it directly in an adapter:
 *
 * ```ts
 * throw new BookingError({ code: 'SLOT_UNAVAILABLE', message: 'Just taken' });
 * ```
 */
export class BookingError extends Error {
  readonly code: BookingErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(options: BookingErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'BookingError';
    this.code = options.code;
    if (options.fieldErrors !== undefined) this.fieldErrors = options.fieldErrors;
  }
}

export function isBookingErrorCode(value: unknown): value is BookingErrorCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

/**
 * Structural check, deliberately not `instanceof`: an adapter may hold a second
 * copy of this package, and a real failure must not be downgraded to an
 * unknown outcome because of that.
 */
export function isBookingError(value: unknown): value is BookingError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === 'BookingError' &&
    isBookingErrorCode(candidate.code) &&
    typeof candidate.message === 'string'
  );
}

/**
 * Turns anything an adapter threw into a `BookingError`.
 *
 * `fallbackCode` belongs to the caller because only the caller knows what the
 * failure means: a rejected creation without a guarantee becomes
 * `UNKNOWN_OUTCOME`, while an availability request becomes `GENERIC_FAILURE`.
 */
export function toBookingError(value: unknown, fallbackCode: BookingErrorCode): BookingError {
  if (isBookingError(value)) return value;

  const message = value instanceof Error ? value.message : String(value);
  return new BookingError({ code: fallbackCode, message, cause: value });
}

/**
 * `true` for a cancellation the library itself triggered. A cancelled load is
 * not a failure and must not reach `onError`.
 */
export function isAbortError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const name = (value as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** The codes that guarantee the booking was not created. */
export function guaranteesNotCreated(code: BookingErrorCode): boolean {
  return code !== 'UNKNOWN_OUTCOME' && code !== 'ADAPTER_CONTRACT_VIOLATION';
}
