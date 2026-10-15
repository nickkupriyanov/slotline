import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOKING_CONTEXT } from './context';
import { addDays, dayKeyOf, monthKeyOf, todayKey } from './date';
import { isBookingError } from './errors';
import { createMockAdapter } from './mock';
import type { AvailabilityAdapter, AvailabilityQuery, BookingRequest, SlotsQuery } from './types';

const noWait = { latency: 0 };
const controller = new AbortController();
const context = DEFAULT_BOOKING_CONTEXT;

function availabilityQuery(
  from: string,
  to: string,
  duration: number,
  timeZone: string,
): AvailabilityQuery {
  return { from, to, duration, timeZone, context, signal: controller.signal };
}

function slotsQuery(date: string, duration: number, timeZone: string): SlotsQuery {
  return { date, duration, timeZone, context, signal: controller.signal };
}

/** A request against a fixed offer, so creation tests never depend on the calendar. */
function bookingRequest(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    slot: { id: '2026-05-18#0915', start: '2026-05-18T09:15:00Z' },
    date: '2026-05-18',
    duration: 30,
    timeZone: 'UTC',
    context,
    values: { name: 'Ann', email: 'ann@example.com' },
    idempotencyKey: 'key-1',
    ...overrides,
  };
}

async function firstOpenDay(adapter: AvailabilityAdapter, from: string, attempts = 14) {
  for (let index = 0; index < attempts; index += 1) {
    const date = addDays(from, index);
    const slots = await adapter.getSlots(slotsQuery(date, 30, 'UTC'));
    if (slots.length > 0) return { date, slots };
  }
  throw new Error(`no open day within ${attempts} days of ${from}`);
}

async function captureFailure(run: () => Promise<unknown>): Promise<unknown> {
  return run().then(
    () => null,
    (error: unknown) => error,
  );
}

describe('createMockAdapter · availability', () => {
  it('only publishes open weekdays inside the requested range', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 21, timeZone: 'UTC' });
    const from = todayKey('UTC');
    const days = await adapter.getAvailability(
      availabilityQuery(from, addDays(from, 20), 30, 'UTC'),
    );

    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(day.date >= from && day.date <= addDays(from, 20)).toBe(true);
      const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
    }
  });

  it('never advertises a slot count it cannot deliver', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 14, timeZone: 'UTC' });
    const from = todayKey('UTC');
    const days = await adapter.getAvailability(
      availabilityQuery(from, addDays(from, 13), 15, 'UTC'),
    );

    for (const day of days) {
      const slots = await adapter.getSlots(slotsQuery(day.date, 15, 'UTC'));
      expect(slots.length).toBe(day.slotCount);
      // Slots are real instants in the requested zone and always in the future.
      for (const slot of slots) {
        expect(dayKeyOf(new Date(slot.start), 'UTC')).toBe(day.date);
        expect(new Date(slot.start).getTime()).toBeGreaterThan(Date.now());
      }
    }
  });

  it('keeps the requested duration between slots', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 14, timeZone: 'UTC' });
    const from = todayKey('UTC');
    const days = await adapter.getAvailability(
      availabilityQuery(from, addDays(from, 13), 30, 'UTC'),
    );
    const first = days[0];
    expect(first).toBeDefined();

    const slots = await adapter.getSlots(slotsQuery(first!.date, 30, 'UTC'));
    for (const slot of slots) {
      expect(new Date(slot.end!).getTime() - new Date(slot.start).getTime()).toBe(30 * 60_000);
    }
  });

  it('honours the workday window and the time zone', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      horizonDays: 21,
      timeZone: 'Asia/Tokyo',
      workday: { start: 9 * 60, end: 12 * 60 },
      busyRatio: 0,
    });
    const from = todayKey('Asia/Tokyo');
    const days = await adapter.getAvailability(
      availabilityQuery(from, addDays(from, 20), 60, 'Asia/Tokyo'),
    );
    const day = days.find((candidate) => candidate.date > from) ?? days[0];
    expect(day).toBeDefined();

    const slots = await adapter.getSlots(slotsQuery(day!.date, 60, 'Asia/Tokyo'));
    expect(slots).toHaveLength(3);
    expect(monthKeyOf(dayKeyOf(new Date(slots[0]!.start), 'Asia/Tokyo'))).toBe(
      monthKeyOf(day!.date),
    );
  });

  it('stops publishing beyond the horizon', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 5, timeZone: 'UTC' });
    const today = todayKey('UTC');
    const days = await adapter.getAvailability(
      availabilityQuery(today, addDays(today, 30), 30, 'UTC'),
    );

    for (const day of days) expect(day.date <= addDays(today, 5)).toBe(true);
    expect(await adapter.getSlots(slotsQuery(addDays(today, 12), 30, 'UTC'))).toEqual([]);
  });

  it('reasons from the injected clock instead of the real one', async () => {
    const fixedNow = Date.parse('2030-01-15T12:00:00Z');
    const withClock = createMockAdapter({
      ...noWait,
      horizonDays: 10,
      timeZone: 'UTC',
      busyRatio: 0,
      now: () => fixedNow,
    });
    const days = await withClock.getAvailability(
      availabilityQuery('2030-01-15', '2030-01-25', 30, 'UTC'),
    );

    expect(days.length).toBeGreaterThan(0);
    for (const day of days) expect(day.date >= '2030-01-15').toBe(true);

    const withoutClock = createMockAdapter({ ...noWait, horizonDays: 10, timeZone: 'UTC' });
    expect(
      await withoutClock.getAvailability(availabilityQuery('2030-01-15', '2030-01-25', 30, 'UTC')),
    ).toEqual([]);
  });

  it('classifies an injected availability failure', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      availabilityFailures: [{ code: 'TEMPORARY_FAILURE', message: 'Upstream is down' }],
    });
    const today = todayKey('UTC');
    const failure = await captureFailure(() =>
      adapter.getAvailability(availabilityQuery(today, addDays(today, 5), 30, 'UTC')),
    );

    expect(isBookingError(failure)).toBe(true);
    if (!isBookingError(failure)) throw new Error('expected a BookingError');
    expect(failure.code).toBe('TEMPORARY_FAILURE');
    expect(failure.message).toBe('Upstream is down');
  });
});

describe('createMockAdapter · offer identity', () => {
  it('gives every offer an id', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      horizonDays: 14,
      timeZone: 'UTC',
      busyRatio: 0,
    });
    const { slots } = await firstOpenDay(adapter, todayKey('UTC'));

    for (const slot of slots) {
      expect(typeof slot.id).toBe('string');
      expect(slot.id.length).toBeGreaterThan(0);
    }
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(slots.length);
  });

  it('keeps offer ids stable when the rendered time zone changes', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      horizonDays: 30,
      timeZone: 'UTC',
      busyRatio: 0,
    });
    // A few days out: the first open day in UTC can already be yesterday in Tokyo,
    // and a day the calendar no longer advertises must not deliver slots either.
    const { date, slots } = await firstOpenDay(adapter, addDays(todayKey('UTC'), 3));

    const inTokyo = await adapter.getSlots(slotsQuery(date, 30, 'Asia/Tokyo'));

    expect(inTokyo.map((slot) => slot.id)).toEqual(slots.map((slot) => slot.id));
  });
});

describe('createMockAdapter · creation', () => {
  it('confirms a booking with an explicit invitation status', async () => {
    const adapter = createMockAdapter(noWait);
    const result = await adapter.createBooking(bookingRequest());

    expect(result.status).toBe('confirmed');
    expect(typeof result.id).toBe('string');
    expect(result.invitation).toEqual({ status: 'sent', email: 'ann@example.com' });
  });

  it('advertises idempotent create with a retention window', () => {
    const adapter = createMockAdapter({ ...noWait, idempotencyRetentionMs: 60_000 });

    expect(adapter.capabilities).toEqual({
      idempotentCreate: true,
      idempotencyRetentionMs: 60_000,
    });
  });

  it('returns the same booking for a repeated attempt', async () => {
    const adapter = createMockAdapter(noWait);
    const request = bookingRequest();

    const first = await adapter.createBooking(request);
    const repeated = await adapter.createBooking(request);

    expect(repeated.id).toBe(first.id);
  });

  it('creates a second record when the server has no idempotent create', async () => {
    const adapter = createMockAdapter({ ...noWait, idempotentCreate: false });
    const request = bookingRequest();

    const first = await adapter.createBooking(request);
    const repeated = await adapter.createBooking(request);

    expect(first.id).not.toBe(repeated.id);
    expect(adapter.capabilities).toEqual({ idempotentCreate: false });
  });

  it('treats a repeated request after an unknown outcome as the created booking', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      createBookingFailures: [{ code: 'UNKNOWN_OUTCOME' }],
    });
    const request = bookingRequest();

    const failure = await captureFailure(() => adapter.createBooking(request));
    expect(isBookingError(failure)).toBe(true);
    if (!isBookingError(failure)) throw new Error('expected a BookingError');
    expect(failure.code).toBe('UNKNOWN_OUTCOME');

    // The record was created even though the client never saw the response.
    const retried = await adapter.createBooking(request);
    expect(retried.status).toBe('confirmed');
    expect(retried.invitation?.email).toBe('ann@example.com');
  });

  it('passes server-side field errors through', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      createBookingFailures: [
        {
          code: 'VALIDATION_FAILED',
          message: 'Check the form',
          fieldErrors: { phone: 'Invalid number' },
        },
      ],
    });

    const failure = await captureFailure(() => adapter.createBooking(bookingRequest()));
    expect(isBookingError(failure)).toBe(true);
    if (!isBookingError(failure)) throw new Error('expected a BookingError');
    expect(failure.fieldErrors).toEqual({ phone: 'Invalid number' });
  });

  it('classifies an injected slot conflict', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      slotFailures: [{ code: 'SLOT_UNAVAILABLE', message: 'Just taken' }],
    });
    const today = todayKey('UTC');
    const failure = await captureFailure(() =>
      adapter.getSlots(slotsQuery(addDays(today, 1), 30, 'UTC')),
    );

    expect(isBookingError(failure)).toBe(true);
    if (!isBookingError(failure)) throw new Error('expected a BookingError');
    expect(failure.code).toBe('SLOT_UNAVAILABLE');
  });
});
