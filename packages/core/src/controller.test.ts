import { describe, expect, it, vi } from 'vitest';
import {
  createBookingController,
  type BookingConfigOverrides,
  type BookingController,
  type BookingControllerHandlers,
  type BookingControllerInputs,
} from './controller';
import { BookingError } from './errors';
import type {
  AvailabilityQuery,
  BookingAdapter,
  BookingRequest,
  BookingValues,
  SlotsQuery,
  TimeSlot,
} from './types';

const DAY = '2026-05-04';
const NEXT_DAY = '2026-05-05';
const SLOT_A: TimeSlot = { id: 'a', start: '2026-05-04T09:15:00Z' };
/** Late enough that the same instant is the next day in Tokyo. */
const SLOT_B: TimeSlot = { id: 'b', start: '2026-05-04T22:30:00Z' };

const START_MS = Date.parse('2026-05-04T09:00:00Z');
const MIDNIGHT_MS = Date.parse('2026-05-05T00:00:00Z');
const RETENTION_MS = 3_600_000;

/* -------------------------------------------------------------------------- */
/*  Doubles                                                                    */
/* -------------------------------------------------------------------------- */

interface AdapterCalls {
  availability: number;
  slots: number;
  bookings: Array<BookingRequest<BookingValues>>;
}

function createAdapter(overrides: Partial<BookingAdapter> = {}) {
  const calls: AdapterCalls = { availability: 0, slots: 0, bookings: [] };

  const adapter: BookingAdapter = {
    async getAvailability({ from, to }: AvailabilityQuery) {
      calls.availability += 1;
      const days = [DAY, NEXT_DAY].filter((date) => date >= from && date <= to);
      return days.map((date) => ({ date, slotCount: 2 }));
    },
    async getSlots({ date }: SlotsQuery) {
      calls.slots += 1;
      return date === DAY || date === NEXT_DAY ? [SLOT_A, SLOT_B] : [];
    },
    async createBooking(request) {
      calls.bookings.push(request);
      return {
        id: `booking-${calls.bookings.length}`,
        status: 'confirmed',
        invitation: { status: 'sent', email: 'ann@example.com' },
      };
    },
    capabilities: { idempotentCreate: true, idempotencyRetentionMs: RETENTION_MS },
    ...overrides,
  };

  return { adapter, calls };
}

/** A clock a test drives by hand: scheduled work runs only when time passes. */
function createTestClock(startMs = START_MS) {
  let nowMs = startMs;
  const scheduled: Array<{ at: number; run: () => void }> = [];

  return {
    clock: {
      now: () => nowMs,
      schedule(at: number, callback: () => void) {
        const entry = { at, run: callback };
        scheduled.push(entry);
        return () => {
          const index = scheduled.indexOf(entry);
          if (index >= 0) scheduled.splice(index, 1);
        };
      },
    },
    scheduledAt: () => scheduled.map((entry) => entry.at),
    advance(ms: number) {
      nowMs += ms;
      const due = scheduled.filter((entry) => entry.at <= nowMs).sort((a, b) => a.at - b.at);
      for (const entry of due) {
        // A timer that fired is gone, exactly like a real one.
        const index = scheduled.indexOf(entry);
        if (index >= 0) scheduled.splice(index, 1);
        entry.run();
      }
    },
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

interface HarnessOptions {
  adapter?: Partial<BookingAdapter>;
  inputs?: BookingControllerInputs;
  handlers?: BookingControllerHandlers;
  config?: BookingConfigOverrides;
  initialTime?: number;
}

interface Harness {
  controller: BookingController;
  calls: AdapterCalls;
  /** The very object the controller holds, so a test can swap one method. */
  adapter: BookingAdapter;
  clock: ReturnType<typeof createTestClock>;
  inputs: (next: BookingControllerInputs) => void;
}

function createHarness(options: HarnessOptions = {}): Harness {
  const { adapter, calls } = createAdapter(options.adapter ?? {});
  const clock = createTestClock();

  const controller = createBookingController({
    adapter,
    clock: clock.clock,
    ...(options.config ? { config: options.config } : {}),
    ...(options.inputs ? { inputs: options.inputs } : {}),
    ...(options.handlers ? { handlers: options.handlers } : {}),
    ...(options.initialTime === undefined ? {} : { initialTime: options.initialTime }),
  });

  return { controller, calls, adapter, clock, inputs: (next) => controller.updateInputs(next) };
}

/** date → time → details, with a filled form. */
async function reachDetails(controller: BookingController): Promise<void> {
  controller.start();
  await flush();
  controller.actions.selectDate(DAY);
  await flush();
  controller.actions.selectSlot(SLOT_A);
  controller.actions.setValues({ name: 'Ann', email: 'ann@example.com' });
}

function createUnresolvedHarness(options: HarnessOptions = {}): Harness {
  const harness = createHarness(options);
  // Record what was sent, then fail without a verdict: the client cannot know
  // whether the record exists.
  harness.adapter.createBooking = async (request) => {
    harness.calls.bookings.push(request);
    throw new Error('socket closed');
  };
  return harness;
}

async function reachUnresolved(options: HarnessOptions = {}) {
  const harness = createUnresolvedHarness(options);
  await reachDetails(harness.controller);
  await harness.controller.actions.submit();
  return harness;
}

/* -------------------------------------------------------------------------- */
/*  Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

describe('controller · lifecycle', () => {
  it('sends nothing until it is started', () => {
    const { controller, calls } = createHarness();

    expect(calls.availability).toBe(0);
    expect(calls.slots).toBe(0);
    expect(controller.getSnapshot().view.step).toBe('date');
  });

  it('loads availability on start and ignores a second start', async () => {
    const { controller, calls } = createHarness();

    controller.start();
    controller.start();
    await flush();

    expect(calls.availability).toBe(1);
    expect(controller.getSnapshot().view.days[DAY]?.bookable).toBe(true);
  });

  it('does not report a cancellation as an error', async () => {
    const onError = vi.fn();
    const { controller } = createHarness({
      handlers: { onError },
      adapter: {
        async getAvailability() {
          throw new DOMException('Aborted', 'AbortError');
        },
      },
    });

    controller.start();
    controller.stop();
    await flush();

    expect(onError).not.toHaveBeenCalled();
  });

  it('can be started again after a stop', async () => {
    const { controller, calls } = createHarness();

    controller.start();
    await flush();
    controller.stop();
    controller.start();
    await flush();

    expect(calls.availability).toBe(2);
  });

  it('notifies subscribers and lets them leave', async () => {
    const { controller } = createHarness();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.start();
    await flush();
    expect(listener).toHaveBeenCalled();

    const seen = listener.mock.calls.length;
    unsubscribe();
    controller.actions.nextMonth();
    expect(listener.mock.calls.length).toBe(seen);
  });
});

/* -------------------------------------------------------------------------- */
/*  Snapshot identity — what keeps a React binding from looping                */
/* -------------------------------------------------------------------------- */

describe('controller · snapshot', () => {
  it('returns the very same object while nothing changes', () => {
    const { controller } = createHarness();
    const first = controller.getSnapshot();

    expect(controller.getSnapshot()).toBe(first);
    expect(controller.getSnapshot()).toBe(first);
  });

  it('produces a new snapshot with a higher revision after a change', () => {
    const { controller } = createHarness();
    const first = controller.getSnapshot();

    controller.actions.nextMonth();
    const second = controller.getSnapshot();

    expect(second).not.toBe(first);
    expect(second.revision).toBeGreaterThan(first.revision);
  });

  it('ignores clock movement inside the same day', () => {
    const { controller, clock } = createHarness();
    controller.start();
    const first = controller.getSnapshot();

    // Nothing the view shows has changed a minute later, so the snapshot must stay
    // identical: a new object here would re-render on every clock tick.
    clock.advance(60_000);
    controller.refreshTime();

    expect(controller.getSnapshot()).toBe(first);
  });

  it('notices a new day', () => {
    const { controller, clock } = createHarness();
    controller.start();
    const first = controller.getSnapshot();

    clock.advance(MIDNIGHT_MS - START_MS + 60_000);
    const next = controller.getSnapshot();

    expect(next).not.toBe(first);
    expect(next.view.days[NEXT_DAY]?.isToday).toBe(true);
  });

  it('hands out the time reference for server rendering', () => {
    const { controller } = createHarness();

    expect(controller.getTimeAnchor()).toEqual({ nowMs: START_MS, today: DAY });
  });

  it('starts from the instant the server serialised, then follows the clock', () => {
    const { controller } = createHarness({ initialTime: Date.parse('2026-05-10T08:00:00Z') });

    expect(controller.getTimeAnchor().today).toBe('2026-05-10');

    controller.refreshTime();

    expect(controller.getTimeAnchor().today).toBe(DAY);
  });
});

/* -------------------------------------------------------------------------- */
/*  Time boundaries                                                            */
/* -------------------------------------------------------------------------- */

describe('controller · time', () => {
  it('schedules the next local midnight', () => {
    const { controller, clock } = createHarness();
    controller.start();

    expect(clock.scheduledAt()).toEqual([MIDNIGHT_MS]);
  });

  it('moves to the next day when the boundary fires', () => {
    const { controller, clock } = createHarness();
    controller.start();

    clock.advance(MIDNIGHT_MS - START_MS);

    expect(controller.getTimeAnchor().today).toBe(NEXT_DAY);
    // And it re-armed for the day after that.
    expect(clock.scheduledAt()).toEqual([Date.parse('2026-05-06T00:00:00Z')]);
  });

  it('schedules the close of the retry window', async () => {
    const { clock } = await reachUnresolved();

    expect(clock.scheduledAt()).toEqual([START_MS + RETENTION_MS]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Availability and offers                                                    */
/* -------------------------------------------------------------------------- */

describe('controller · loading', () => {
  it('loads the offers of a day the user picks', async () => {
    const { controller, calls } = createHarness();
    controller.start();
    await flush();

    controller.actions.selectDate(DAY);
    await flush();

    expect(calls.slots).toBe(1);
    const view = controller.getSnapshot().view;
    expect(view.step).toBe('time');
    expect(view.slots.items.map((item) => item.label)).toEqual(['09:15', '22:30']);
  });

  it('uses the offers an adapter inlined into the day', async () => {
    const { controller, calls } = createHarness({
      adapter: {
        async getAvailability() {
          return [{ date: DAY, slots: [SLOT_A] }];
        },
      },
    });
    controller.start();
    await flush();

    controller.actions.selectDate(DAY);
    await flush();

    expect(calls.slots).toBe(0);
    expect(controller.getSnapshot().view.slots.items).toHaveLength(1);
  });

  it('reports an availability failure', async () => {
    const onError = vi.fn();
    const { controller } = createHarness({
      handlers: { onError },
      adapter: {
        async getAvailability() {
          throw new BookingError({ code: 'TEMPORARY_FAILURE', message: 'Upstream is down' });
        },
      },
    });

    controller.start();
    await flush();

    expect(controller.getSnapshot().state.days).toEqual({});
    expect(controller.getSnapshot().view.days[DAY]?.bookable).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TEMPORARY_FAILURE' }),
      expect.objectContaining({ phase: 'availability', outcome: 'not_applicable' }),
    );
  });

  it('treats a broken offer list as an adapter contract violation', async () => {
    const onError = vi.fn();
    const { controller } = createHarness({
      handlers: { onError },
      adapter: {
        async getSlots() {
          return [
            { id: 'same', start: SLOT_A.start },
            { id: 'same', start: SLOT_B.start },
          ];
        },
      },
    });
    controller.start();
    await flush();
    controller.actions.selectDate(DAY);
    await flush();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ADAPTER_CONTRACT_VIOLATION' }),
      expect.objectContaining({ phase: 'slots' }),
    );
    expect(controller.getSnapshot().view.slots.error).toBeTruthy();
  });

  it('drops an availability response that arrived too late', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let round = 0;

    const { controller } = createHarness({
      adapter: {
        async getAvailability({ from, to }) {
          round += 1;
          if (round === 1) await gate;
          return [DAY, NEXT_DAY]
            .filter((date) => date >= from && date <= to)
            .map((date) => ({ date, slotCount: round }));
        },
      },
    });

    controller.start();
    controller.actions.nextMonth();
    await flush();
    release?.();
    await flush();

    // The late first answer belongs to May and must not touch the June view.
    const view = controller.getSnapshot().view;
    expect(view.month.key).toBe('2026-06');
    expect(view.days[DAY]).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Creating a booking                                                         */
/* -------------------------------------------------------------------------- */

describe('controller · submit', () => {
  it('refuses to send an invalid form and marks the fields', async () => {
    const { controller, calls } = createHarness();
    controller.start();
    await flush();
    controller.actions.selectDate(DAY);
    await flush();
    controller.actions.selectSlot(SLOT_A);

    await controller.actions.submit();

    expect(calls.bookings).toHaveLength(0);
    expect(controller.getSnapshot().view.form.visibleErrors.name).toBeTruthy();
  });

  it('freezes one request and sends it once for two synchronous submits', async () => {
    const { controller, calls } = createHarness();
    await reachDetails(controller);

    await Promise.all([controller.actions.submit(), controller.actions.submit()]);

    expect(calls.bookings).toHaveLength(1);
    const request = calls.bookings[0];
    expect(request).toMatchObject({
      date: DAY,
      duration: 15,
      timeZone: 'UTC',
      context: { key: 'default' },
      values: { name: 'Ann', email: 'ann@example.com' },
    });
    expect(typeof request?.idempotencyKey).toBe('string');
    expect(request?.slot.id).toBe(SLOT_A.id);
  });

  it('confirms the booking and tells the application once', async () => {
    const onBooked = vi.fn();
    const { controller } = createHarness({ handlers: { onBooked } });
    await reachDetails(controller);

    await controller.actions.submit();

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('confirmed');
    expect(view.confirmation?.id).toBe('booking-1');
    expect(view.confirmation?.invitation).toBe('Calendar invite sent to ann@example.com.');
    expect(onBooked).toHaveBeenCalledTimes(1);
  });

  it('uses the key of the request as the key of the attempt', async () => {
    // `resolveAttempt` is handed the key from the frozen request, so the two must be
    // the same key. They were generated separately once, and resolving a real attempt
    // was refused because of it.
    const keys: string[] = [];
    const { controller } = createUnresolvedHarness({
      handlers: {
        onError: (_error, context) => {
          if (context.request) keys.push(context.request.idempotencyKey);
        },
      },
    });
    await reachDetails(controller);
    await controller.actions.submit();

    const attempt = controller.getSnapshot().state.attempt;
    expect(keys).toHaveLength(1);
    expect(attempt?.idempotencyKey).toBe(keys[0]);
    expect(attempt?.request.idempotencyKey).toBe(keys[0]);
    expect(
      controller.actions.resolveAttempt({
        idempotencyKey: keys[0] as string,
        outcome: { status: 'not_created' },
      }),
    ).toBe(true);
  });

  it('keeps a created booking out of the failure path when onBooked throws', async () => {
    const onError = vi.fn();
    const { controller } = createHarness({
      handlers: {
        onBooked: () => {
          throw new Error('analytics exploded');
        },
        onError,
      },
    });
    await reachDetails(controller);

    await controller.actions.submit();

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('confirmed');
    expect(onError).not.toHaveBeenCalled();
    expect(view.actions.canSubmit).toBe(false);
  });

  it('clears a taken offer and refreshes what the adapter knows', async () => {
    const onError = vi.fn();
    const { controller, calls } = createHarness({
      handlers: { onError },
      adapter: {
        async createBooking() {
          throw new BookingError({ code: 'SLOT_UNAVAILABLE', message: 'Just taken' });
        },
      },
    });
    await reachDetails(controller);
    const availabilityBefore = calls.availability;

    await controller.actions.submit();

    const view = controller.getSnapshot().view;
    expect(view.selection.slot).toBeNull();
    expect(view.step).toBe('time');
    expect(view.selection.reason).toBe('availability-change');
    // The form the user filled in survives.
    expect(view.form.values).toEqual({ name: 'Ann', email: 'ann@example.com' });
    expect(calls.availability).toBeGreaterThan(availabilityBefore);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SLOT_UNAVAILABLE' }),
      expect.objectContaining({ phase: 'booking', outcome: 'not_created' }),
    );
  });

  it('places server field errors on the fields and the rest in the form area', async () => {
    const { controller } = createHarness({
      adapter: {
        async createBooking() {
          throw new BookingError({
            code: 'VALIDATION_FAILED',
            message: 'Check the form',
            fieldErrors: { email: 'Already booked', desk: 'Unknown desk' },
          });
        },
      },
    });
    await reachDetails(controller);

    await controller.actions.submit();

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('details');
    expect(view.form.visibleErrors.email).toBe('Already booked');
    expect(view.form.formError).toContain('desk');
    expect(view.actions.canSubmit).toBe(true);
  });

  it('treats an unclassified failure as an unknown outcome', async () => {
    const { controller } = createUnresolvedHarness();
    await reachDetails(controller);

    await controller.actions.submit();

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('attempt');
    expect(view.attempt).toMatchObject({ status: 'unknown', retryAllowed: true });
    expect(view.live.message).toContain('could not confirm');
  });
});

/* -------------------------------------------------------------------------- */
/*  Attempts: retry and resolution                                             */
/* -------------------------------------------------------------------------- */

describe('controller · attempts', () => {
  it('repeats a safe attempt with the same key and the same offer', async () => {
    const { controller, calls } = await reachUnresolved();
    const first = calls.bookings[0];

    controller.actions.retry();
    await flush();

    expect(calls.bookings).toHaveLength(2);
    expect(calls.bookings[1]?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(calls.bookings[1]?.slot.id).toBe(first?.slot.id);
  });

  it('refuses to repeat once the window has closed', async () => {
    const { controller, calls, clock } = await reachUnresolved();
    const before = calls.bookings.length;

    clock.advance(2 * RETENTION_MS);
    controller.actions.retry();
    await flush();

    expect(calls.bookings.length).toBe(before);
    expect(controller.getSnapshot().view.attempt?.retryDescription).toContain('expired');
  });

  it('refuses to repeat when the adapter promised nothing', async () => {
    const harness = await reachUnresolved({ adapter: { capabilities: undefined } });
    const before = harness.calls.bookings.length;

    harness.controller.actions.retry();
    await flush();

    expect(harness.calls.bookings.length).toBe(before);
    expect(harness.controller.getSnapshot().view.attempt?.retryDescription).toContain('not safe');
  });

  it('answers false for a key that is not the pending one', async () => {
    const { controller } = await reachUnresolved();

    expect(
      controller.actions.resolveAttempt({
        idempotencyKey: 'someone-else',
        outcome: { status: 'not_created' },
      }),
    ).toBe(false);
    expect(controller.getSnapshot().view.step).toBe('attempt');
  });

  it('accepts a booking the application found on the server', async () => {
    const onBooked = vi.fn();
    const { controller } = await reachUnresolved();
    const attempt = controller.getSnapshot().state.attempt;
    if (!attempt) throw new Error('no attempt');

    const clock = createTestClock();
    const settled = createBookingController({
      adapter: createAdapter().adapter,
      clock: clock.clock,
      initialAttempt: {
        idempotencyKey: attempt.idempotencyKey,
        request: attempt.request,
        startedAt: attempt.startedAt,
        status: 'unknown',
      },
      handlers: { onBooked },
    });

    const accepted = settled.actions.resolveAttempt({
      idempotencyKey: attempt.idempotencyKey,
      outcome: { status: 'created', result: { id: 'found', status: 'confirmed' } },
    });

    expect(accepted).toBe(true);
    expect(settled.getSnapshot().view.step).toBe('confirmed');
    expect(settled.getSnapshot().view.confirmation?.id).toBe('found');
    expect(onBooked).toHaveBeenCalledTimes(1);
  });

  it('returns to the form when nothing was created and allows a new operation', async () => {
    const { controller, calls } = await reachUnresolved();
    const attempt = controller.getSnapshot().state.attempt;
    if (!attempt) throw new Error('no attempt');

    const accepted = controller.actions.resolveAttempt({
      idempotencyKey: attempt.idempotencyKey,
      outcome: { status: 'not_created' },
      message: 'Nothing was created.',
    });

    expect(accepted).toBe(true);
    const view = controller.getSnapshot().view;
    expect(view.step).toBe('details');
    expect(view.attempt).toBeNull();
    expect(view.form.formError).toBe('Nothing was created.');

    await controller.actions.submit();
    expect(calls.bookings).toHaveLength(2);
    expect(calls.bookings[1]?.idempotencyKey).not.toBe(attempt.idempotencyKey);
  });

  it('keeps the block while the outcome stays unknown', async () => {
    const { controller } = await reachUnresolved();
    const attempt = controller.getSnapshot().state.attempt;
    if (!attempt) throw new Error('no attempt');

    expect(
      controller.actions.resolveAttempt({
        idempotencyKey: attempt.idempotencyKey,
        outcome: { status: 'unknown' },
      }),
    ).toBe(true);
    expect(controller.getSnapshot().view.step).toBe('attempt');
  });

  it('keeps an unresolved attempt across a reset and keeps submission blocked', async () => {
    const { controller, calls } = await reachUnresolved();

    controller.actions.reset();
    await flush();

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('attempt');
    expect(view.form.values).toEqual({ name: '', email: '' });

    await controller.actions.submit();
    expect(calls.bookings).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Controlled and uncontrolled values                                         */
/* -------------------------------------------------------------------------- */

describe('controller · controlled values', () => {
  it('applies and announces an uncontrolled duration', () => {
    const onDurationChange = vi.fn();
    const { controller } = createHarness({ handlers: { onDurationChange } });

    controller.actions.setDuration(30);

    expect(controller.getSnapshot().view.duration.current).toBe(30);
    expect(onDurationChange).toHaveBeenCalledWith(
      30,
      expect.objectContaining({ reason: 'duration-change' }),
    );
  });

  it('only proposes a controlled duration until the application answers', () => {
    const onDurationChange = vi.fn();
    const { controller, inputs } = createHarness({
      inputs: { duration: 15 },
      handlers: { onDurationChange },
    });

    controller.actions.setDuration(30);
    expect(onDurationChange).toHaveBeenCalledTimes(1);
    // Nothing moved: the application has not sent the value back yet.
    expect(controller.getSnapshot().view.duration.current).toBe(15);

    inputs({ duration: 30 });
    expect(controller.getSnapshot().view.duration.current).toBe(30);
  });

  it('warns once when a controlled value appears after creation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { controller } = createHarness();

    controller.updateInputs({ duration: 30 });
    controller.updateInputs({ duration: 45 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().view.duration.current).toBe(15);
    warn.mockRestore();
  });

  it('leaves a controlled value alone when the application sends undefined', () => {
    const { controller, inputs } = createHarness({ inputs: { timeFormat: '24h' } });

    inputs({ timeFormat: undefined });

    expect(controller.getSnapshot().view.settings.timeFormat).toBe('24h');
  });
});

/* -------------------------------------------------------------------------- */
/*  Configuration changes                                                      */
/* -------------------------------------------------------------------------- */

describe('controller · configuration', () => {
  it('keeps the snapshot stable when the same configuration is re-supplied', () => {
    const { controller } = createHarness();

    controller.updateConfig({ locale: 'en', weekStartsOn: 0 });
    const before = controller.getSnapshot();

    controller.updateConfig({ locale: 'en', weekStartsOn: 0 });

    expect(controller.getSnapshot()).toBe(before);
  });

  it('re-checks the same offer when the time zone changes', async () => {
    const { controller, calls, inputs } = createHarness({ inputs: { timeZone: 'UTC' } });
    controller.start();
    await flush();
    controller.actions.selectDate(DAY);
    await flush();
    // The offer is late in the day: in Tokyo it belongs to the next day.
    controller.actions.selectSlot(SLOT_B);

    inputs({ timeZone: 'Asia/Tokyo' });
    await flush();

    const view = controller.getSnapshot().view;
    expect(view.settings.timeZone).toBe('Asia/Tokyo');
    expect(view.selection.date).toBe(NEXT_DAY);
    expect(view.selection.slot?.id).toBe(SLOT_B.id);
    expect(view.selection.status).toBe('valid');
    expect(calls.slots).toBeGreaterThan(1);
  });

  it('clears the selection when the schedule changes', async () => {
    const { controller } = createHarness();
    await reachDetails(controller);

    controller.actions.setContext({ key: 'clinic-1' });

    const view = controller.getSnapshot().view;
    expect(view.selection.slot).toBeNull();
    expect(view.selection.date).toBeNull();
    expect(view.step).toBe('date');
    expect(view.settings.contextKey).toBe('clinic-1');
    expect(view.form.values).toEqual({ name: 'Ann', email: 'ann@example.com' });
  });

  it('rejects a selection that a new date limit excludes', async () => {
    const { controller } = createHarness();
    await reachDetails(controller);

    controller.updateConfig({ minDate: NEXT_DAY, maxDate: '2026-05-31' });

    expect(controller.getSnapshot().view.selection).toMatchObject({
      status: 'invalid',
      usable: false,
    });
  });

  it('moves to an allowed duration when the options change', async () => {
    const { controller, calls } = createHarness();
    await reachDetails(controller);

    controller.updateConfig({ durationOptions: [30, 60] });
    await flush();

    expect(controller.getSnapshot().view.duration.current).toBe(30);
    expect(calls.availability).toBeGreaterThan(1);
  });
});
