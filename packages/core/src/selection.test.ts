import { describe, expect, it, vi } from 'vitest';
import { createBookingController, type BookingController } from './controller';
import { DEFAULT_BOOKING_CONTEXT } from './context';
import { createMockAdapter } from './mock';
import type {
  AvailabilityAdapter,
  BookingRequest,
  BookingResult,
  BookingValues,
  TimeSlot,
} from './types';

const NOW = Date.parse('2026-05-04T09:00:00Z');
/** A Monday inside the mock's horizon, so the day is published and open. */
const DAY = '2026-05-04';

/** Availability and slots only: the selection mode must not need a booking method. */
function availabilityAdapter() {
  const mock = createMockAdapter({
    latency: 0,
    horizonDays: 30,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
  });

  return {
    getAvailability: mock.getAvailability,
    getSlots: mock.getSlots,
  } satisfies AvailabilityAdapter;
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

function selectionController(
  overrides: {
    adapter?: AvailabilityAdapter;
    inputs?: Parameters<typeof createBookingController>[0]['inputs'];
    handlers?: Parameters<typeof createBookingController>[0]['handlers'];
  } = {},
): BookingController {
  return createBookingController({
    mode: 'selection',
    adapter: overrides.adapter ?? availabilityAdapter(),
    config: { minDate: DAY, maxDate: '2026-05-31' },
    inputs: { timeZone: 'UTC', ...overrides.inputs },
    handlers: overrides.handlers,
    initialTime: NOW,
  });
}

/** A real offer of the pinned day, taken from the adapter the widget will use. */
async function realSlot(adapter: AvailabilityAdapter, date = DAY): Promise<TimeSlot> {
  const slots = await adapter.getSlots({
    date,
    duration: 15,
    timeZone: 'UTC',
    context: DEFAULT_BOOKING_CONTEXT,
    signal: new AbortController().signal,
  });
  const slot = slots[0];
  if (!slot) throw new Error(`the mock published no offers for ${date}`);
  return slot;
}

/** Walks the flow to the offers of the first bookable day and returns them. */
async function reachOffers(controller: BookingController): Promise<TimeSlot[]> {
  controller.start();
  await flush();

  const grid = controller.getSnapshot().view.month.grid;
  const day = grid.find((candidate) => controller.getSnapshot().view.days[candidate]?.bookable);
  expect(day).toBe(DAY);
  controller.actions.selectDate(day as string);
  await flush();

  const slots = controller.getSnapshot().view.slots.items;
  expect(slots.length).toBeGreaterThan(0);
  return controller.getSnapshot().state.slots;
}

describe('selection mode', () => {
  it('ends at the offer instead of opening a form', async () => {
    const controller = selectionController();
    const slots = await reachOffers(controller);

    controller.actions.selectSlot(slots[0] as TimeSlot);

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('time');
    expect(view.settings.mode).toBe('selection');
    expect(view.selection.usable).toBe(true);
    // The progress bar counts the steps that actually exist.
    expect(view.progress.total).toBe(2);
    expect(view.duration.showSelector).toBe(true);
  });

  it('never creates a booking, even when a submission is asked for', async () => {
    const adapter = availabilityAdapter();
    const createBooking = vi.fn(async (): Promise<BookingResult> => ({
      id: 'never',
      status: 'confirmed',
    }));
    const controller = selectionController({
      adapter: { ...adapter, createBooking } as AvailabilityAdapter,
    });

    const slots = await reachOffers(controller);
    controller.actions.selectSlot(slots[0] as TimeSlot);
    await controller.actions.submit();
    await flush();

    expect(createBooking).not.toHaveBeenCalled();
    expect(controller.getSnapshot().view.step).toBe('time');
  });

  it('reports the offer and why it changed', async () => {
    const onSelectionChange = vi.fn();
    const controller = selectionController({ handlers: { onSelectionChange } });

    const slots = await reachOffers(controller);
    controller.actions.selectSlot(slots[0] as TimeSlot);

    // Two changes: the day, then the offer on it.
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    const [selection, meta] = onSelectionChange.mock.calls[1] as [
      { date: string; slot: TimeSlot | null },
      { reason: string; source: string },
    ];
    expect(selection.date).toBe(DAY);
    expect(selection.slot?.start).toBe((slots[0] as TimeSlot).start);
    expect(meta.reason).toBe('slot-select');
    expect(
      (onSelectionChange.mock.calls[0] as [{ slot: TimeSlot | null }, { reason: string }])[1]
        .reason,
    ).toBe('date-select');
  });

  it('verifies a preset offer against the calendar before it can be used', async () => {
    const onSelectionChange = vi.fn();
    const adapter = availabilityAdapter();
    const slot = await realSlot(adapter);

    const controller = createBookingController({
      mode: 'selection',
      adapter,
      config: { minDate: DAY, maxDate: '2026-05-31' },
      inputs: { timeZone: 'UTC', defaultSelection: { date: DAY, slot } },
      handlers: { onSelectionChange },
      initialTime: NOW,
    });

    // Trusted only as far as the owner says: it starts unverified.
    expect(controller.getSnapshot().view.selection.status).toBe('verifying');

    controller.start();
    await flush();

    const view = controller.getSnapshot().view;
    expect(view.selection.status).toBe('valid');
    expect(view.selection.usable).toBe(true);
    expect(view.selection.slot?.start).toBe(slot.start);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('drops a preset the calendar no longer offers', async () => {
    const onSelectionChange = vi.fn();
    const adapter = availabilityAdapter();
    // A real offer of another day: the preset names an instant this day does not
    // publish, which is exactly what a stale link looks like.
    const slot = await realSlot(adapter);
    const staleDate = '2026-05-05';

    const controller = createBookingController({
      mode: 'selection',
      adapter,
      config: { minDate: staleDate, maxDate: '2026-05-31' },
      inputs: { timeZone: 'UTC', defaultSelection: { date: staleDate, slot } },
      handlers: { onSelectionChange },
      initialTime: NOW,
    });

    controller.start();
    await flush();

    const view = controller.getSnapshot().view;
    expect(view.selection.usable).toBe(false);
    // The date stays where the application put it; the offer it named is gone.
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      { date: staleDate, slot: null },
      expect.objectContaining({ reason: 'availability-change' }),
    );
  });

  it('invalidates the offer when the duration changes', async () => {
    const onSelectionChange = vi.fn();
    const controller = selectionController({ handlers: { onSelectionChange } });

    const slots = await reachOffers(controller);
    controller.actions.selectSlot(slots[0] as TimeSlot);
    expect(controller.getSnapshot().view.selection.usable).toBe(true);

    controller.actions.setDuration(60);
    await flush();

    const view = controller.getSnapshot().view;
    expect(view.selection.usable).toBe(false);
    expect(view.selection.reason).toBe('duration-change');
    expect(view.step).toBe('date');
    const reasons = onSelectionChange.mock.calls.map(
      (call) => (call[1] as { reason: string }).reason,
    );
    expect(reasons).toContain('duration-change');
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      { date: DAY, slot: null },
      expect.objectContaining({ reason: 'duration-change' }),
    );
  });

  it('stays controlled when the application owns the selection', async () => {
    const onSelectionChange = vi.fn();
    const controller = createBookingController({
      mode: 'selection',
      adapter: availabilityAdapter(),
      config: { minDate: DAY, maxDate: '2026-05-31' },
      inputs: { timeZone: 'UTC', selection: null },
      handlers: { onSelectionChange },
      initialTime: NOW,
    });

    // Controlled: nothing is applied until the owner echoes it back, so the day
    // itself has to come back before the offers can even load.
    controller.start();
    await flush();
    const day = controller
      .getSnapshot()
      .view.month.grid.find((candidate) => candidate === DAY) as string;
    controller.actions.selectDate(day);
    expect(controller.getSnapshot().state.selectedDate).toBeNull();
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ date: DAY, slot: null }),
      expect.objectContaining({ reason: 'date-select' }),
    );

    controller.updateInputs({ selection: { date: DAY, slot: null } });
    await flush();
    const slots = controller.getSnapshot().state.slots;
    expect(slots.length).toBeGreaterThan(0);

    controller.actions.selectSlot(slots[0] as TimeSlot);
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        date: DAY,
        slot: expect.objectContaining({ id: (slots[0] as TimeSlot).id }),
      }),
      expect.objectContaining({ reason: 'slot-select' }),
    );
    expect(controller.getSnapshot().state.selectedSlot).toBeNull();

    controller.updateInputs({ selection: { date: DAY, slot: slots[0] as TimeSlot } });
    await flush();
    expect(controller.getSnapshot().view.selection.usable).toBe(true);
  });
});

describe('booking mode without a form', () => {
  it('keeps the resume and creates the record with the values the application supplied', async () => {
    const mock = createMockAdapter({
      latency: 0,
      horizonDays: 30,
      timeZone: 'UTC',
      busyRatio: 0,
      now: () => NOW,
    });
    const booked: Array<BookingRequest<BookingValues>> = [];
    const controller = createBookingController({
      mode: 'booking',
      adapter: mock,
      config: { formMode: 'skip', minDate: DAY, maxDate: '2026-05-31' },
      inputs: {
        timeZone: 'UTC',
        defaultValues: { name: 'Ann', email: 'ann@example.com' },
      },
      handlers: { onBooked: (_result, request) => booked.push(request) },
      initialTime: NOW,
    });

    controller.start();
    await flush();
    controller.actions.selectDate(DAY);
    await flush();

    const slot = controller.getSnapshot().state.slots[0] as TimeSlot;
    controller.actions.selectSlot(slot);
    await flush();

    const view = controller.getSnapshot().view;
    expect(view.step).toBe('details');
    expect(view.form.skipped).toBe(true);
    expect(view.form.valid).toBe(true);
    expect(view.actions.canSubmit).toBe(true);

    await controller.actions.submit();
    await flush();

    expect(controller.getSnapshot().view.step).toBe('confirmed');
    expect(booked[0]?.values).toMatchObject({ name: 'Ann', email: 'ann@example.com' });
  });
});
