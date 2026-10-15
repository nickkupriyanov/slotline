import { describe, expect, it } from 'vitest';
import {
  BOOKING_ERROR_CODES,
  BookingError,
  guaranteesNotCreated,
  isAbortError,
  isBookingError,
  isBookingErrorCode,
  toBookingError,
} from './errors';

describe('BookingError', () => {
  it('carries the code, message, field errors and cause', () => {
    const cause = new Error('socket closed');
    const error = new BookingError({
      code: 'VALIDATION_FAILED',
      message: 'Check the form',
      fieldErrors: { phone: 'Invalid number' },
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('BookingError');
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Check the form');
    expect(error.fieldErrors).toEqual({ phone: 'Invalid number' });
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it('omits field errors and cause when they are not supplied', () => {
    const error = new BookingError({ code: 'GENERIC_FAILURE', message: 'Nope' });

    expect(error.fieldErrors).toBeUndefined();
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });

  it('is recognised structurally, so a second copy of the package still counts', () => {
    // A real failure must not be downgraded to an unknown outcome just because
    // the adapter bundled its own copy of the library.
    const foreign = Object.assign(new Error('Just taken'), {
      name: 'BookingError',
      code: 'SLOT_UNAVAILABLE',
    });

    expect(foreign).not.toBeInstanceOf(BookingError);
    expect(isBookingError(foreign)).toBe(true);
  });

  it('rejects look-alikes with an unknown code, a wrong name or no message', () => {
    expect(isBookingError({ name: 'BookingError', code: 'MADE_UP', message: 'x' })).toBe(false);
    expect(isBookingError({ name: 'Error', code: 'SLOT_UNAVAILABLE', message: 'x' })).toBe(false);
    expect(isBookingError({ name: 'BookingError', code: 'SLOT_UNAVAILABLE' })).toBe(false);
    expect(isBookingError(null)).toBe(false);
    expect(isBookingError('SLOT_UNAVAILABLE')).toBe(false);
  });

  it('normalises an unrecognised rejection with the caller fallback', () => {
    const cause = new Error('boom');
    const normalised = toBookingError(cause, 'UNKNOWN_OUTCOME');

    expect(normalised.code).toBe('UNKNOWN_OUTCOME');
    expect(normalised.message).toBe('boom');
    expect((normalised as { cause?: unknown }).cause).toBe(cause);
  });

  it('keeps a real BookingError untouched when normalising', () => {
    const original = new BookingError({ code: 'TEMPORARY_FAILURE', message: 'Later' });

    expect(toBookingError(original, 'UNKNOWN_OUTCOME')).toBe(original);
  });

  it('normalises a non-Error rejection into a message', () => {
    const normalised = toBookingError('nope', 'GENERIC_FAILURE');

    expect(normalised.code).toBe('GENERIC_FAILURE');
    expect(normalised.message).toBe('nope');
  });

  it('recognises the cancellations the library itself triggers', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(Object.assign(new Error('late'), { name: 'TimeoutError' }))).toBe(true);
    expect(isAbortError(new Error('real failure'))).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it('lists every code exactly once', () => {
    expect(new Set(BOOKING_ERROR_CODES).size).toBe(BOOKING_ERROR_CODES.length);
    for (const code of BOOKING_ERROR_CODES) expect(isBookingErrorCode(code)).toBe(true);
    expect(isBookingErrorCode('MADE_UP')).toBe(false);
  });

  it('separates the codes that guarantee no record was created', () => {
    expect(guaranteesNotCreated('SLOT_UNAVAILABLE')).toBe(true);
    expect(guaranteesNotCreated('VALIDATION_FAILED')).toBe(true);
    expect(guaranteesNotCreated('TEMPORARY_FAILURE')).toBe(true);
    expect(guaranteesNotCreated('GENERIC_FAILURE')).toBe(true);
    expect(guaranteesNotCreated('UNKNOWN_OUTCOME')).toBe(false);
    expect(guaranteesNotCreated('ADAPTER_CONTRACT_VIOLATION')).toBe(false);
  });
});
