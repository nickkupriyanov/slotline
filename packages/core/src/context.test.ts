import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOKING_CONTEXT, DEFAULT_CONTEXT_KEY, contextKeyOf } from './context';

describe('booking context', () => {
  it('exposes a single default schedule', () => {
    expect(DEFAULT_BOOKING_CONTEXT).toEqual({ key: DEFAULT_CONTEXT_KEY });
  });

  it('reads the key of a context', () => {
    expect(contextKeyOf({ key: 'clinic-1', data: { room: 3 } })).toBe('clinic-1');
  });

  it('falls back to the default schedule for a missing context', () => {
    expect(contextKeyOf(undefined)).toBe(DEFAULT_CONTEXT_KEY);
  });
});
