import { describe, expect, it } from 'vitest';
import {
  EMPTY_BOOKING_VALUES,
  bookingReducer,
  createBookingState,
  type BookingAttemptState,
  type BookingState,
} from './reducer';
import type { BookingResult, DayAvailability, TimeSlot } from './types';

const SLOT_ID = '2026-05-18#0915';
const OTHER_SLOT_ID = '2026-05-18#1015';

const slot = (id: string = SLOT_ID, start = '2026-05-18T09:15:00Z'): TimeSlot => ({ id, start });

const bookedResult = (id = 'booking-1'): BookingResult => ({
  id,
  status: 'confirmed',
  invitation: { status: 'sent', email: 'ann@example.com' },
});

function base(overrides: Partial<Parameters<typeof createBookingState>[0]> = {}): BookingState {
  return createBookingState({ duration: 15, month: '2026-05', ...overrides });
}

/** date → time → details, with the offer confirmed by the adapter. */
function reachDetails(state = base()): BookingState {
  let next = bookingReducer(state, { type: 'selectDate', date: '2026-05-18' });
  next = bookingReducer(next, {
    type: 'slotsLoaded',
    token: next.slotsToken,
    slots: [slot(), slot(OTHER_SLOT_ID, '2026-05-18T10:15:00Z')],
  });
  return bookingReducer(next, { type: 'selectSlot', slot: slot() });
}

function attemptFor(state: BookingState, idempotencyKey = 'key-1'): BookingAttemptState {
  return {
    idempotencyKey,
    request: {
      slot: slot(),
      date: state.selectedDate ?? '2026-05-18',
      duration: state.duration,
      timeZone: 'UTC',
      context: { key: 'default' },
      values: { name: 'Ann', email: 'ann@example.com' },
      idempotencyKey,
    },
    startedAt: 1_000,
    status: 'pending',
    scenarioId: state.scenarioId,
  };
}

function startAttempt(state: BookingState, idempotencyKey = 'key-1'): BookingState {
  return bookingReducer(state, {
    type: 'submitStart',
    attempt: attemptFor(state, idempotencyKey),
  });
}

describe('booking reducer · navigation', () => {
  it('starts on the calendar with the default values', () => {
    const state = base();

    expect(state.step).toBe('date');
    expect(state.direction).toBe(1);
    expect(state.selectionStatus).toBe('none');
    expect(state.values).toEqual(EMPTY_BOOKING_VALUES);
    expect(state.attempt).toBeNull();
    expect(state.submitStatus).toBe('idle');
  });

  it('moves forward from date to time to details', () => {
    let state = bookingReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    expect(state.step).toBe('time');
    expect(state.direction).toBe(1);
    expect(state.slotsStatus).toBe('loading');
    expect(state.selectionStatus).toBe('none');

    state = bookingReducer(state, {
      type: 'slotsLoaded',
      token: state.slotsToken,
      slots: [slot()],
    });
    expect(state.slots).toHaveLength(1);
    expect(state.slotsStatus).toBe('ready');

    state = bookingReducer(state, { type: 'selectSlot', slot: slot() });
    expect(state.step).toBe('details');
    expect(state.selectedSlot?.id).toBe(SLOT_ID);
    expect(state.selectionStatus).toBe('valid');
  });

  it('walks back through the steps and stops at the calendar', () => {
    const details = reachDetails();

    const time = bookingReducer(details, { type: 'back' });
    expect(time.step).toBe('time');
    expect(time.direction).toBe(-1);
    // The offer stays highlighted while the user looks at other times.
    expect(time.selectedSlot?.id).toBe(SLOT_ID);

    const date = bookingReducer(time, { type: 'back' });
    expect(date.step).toBe('date');
    expect(date.selectedSlot).toBeNull();
    expect(date.selectionStatus).toBe('none');

    expect(bookingReducer(date, { type: 'back' })).toBe(date);
  });

  it('bumps the selection nonce so the same day can be re-picked', () => {
    const first = bookingReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    expect(first.selectionNonce).toBe(1);

    // Clicking the same day while already on the time step stays a no-op.
    expect(bookingReducer(first, { type: 'selectDate', date: '2026-05-18' })).toBe(first);

    const back = bookingReducer(first, { type: 'back' });
    const again = bookingReducer(back, { type: 'selectDate', date: '2026-05-18' });
    expect(again.selectionNonce).toBe(2);
    expect(again.slotsStatus).toBe('loading');
  });
});

describe('booking reducer · stale responses', () => {
  it('drops availability that no longer matches the newest request', () => {
    let state = bookingReducer(base(), { type: 'daysLoading', token: 7 });
    state = bookingReducer(state, { type: 'daysLoading', token: 8 });

    const stale = bookingReducer(state, {
      type: 'daysLoaded',
      token: 7,
      days: [{ date: '2026-05-04', slotCount: 3 }],
    });
    expect(stale).toBe(state);

    const fresh = bookingReducer(state, {
      type: 'daysLoaded',
      token: 8,
      days: [{ date: '2026-05-04', slotCount: 3 }],
    });
    expect(fresh.daysStatus).toBe('ready');
    expect(fresh.days['2026-05-04']?.slotCount).toBe(3);
  });

  it('drops offers and failures from an older request', () => {
    let state = bookingReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    state = bookingReducer(state, { type: 'slotsLoading', token: 4 });
    state = bookingReducer(state, { type: 'slotsLoading', token: 5 });

    const stale = bookingReducer(state, { type: 'slotsLoaded', token: 4, slots: [slot()] });
    expect(stale).toBe(state);
    expect(bookingReducer(state, { type: 'slotsFailed', token: 4, error: 'old' })).toBe(state);

    const failed = bookingReducer(state, { type: 'slotsFailed', token: 5, error: 'nope' });
    expect(failed.slotsStatus).toBe('error');
    expect(failed.slotsError).toBe('nope');
  });

  it('drops availability failures from an older request', () => {
    let state = bookingReducer(base(), { type: 'daysLoading', token: 2 });
    state = bookingReducer(state, { type: 'daysLoading', token: 3 });

    expect(bookingReducer(state, { type: 'daysFailed', token: 2, error: 'old' })).toBe(state);
    expect(bookingReducer(state, { type: 'daysFailed', token: 3, error: 'new' }).daysError).toBe(
      'new',
    );
  });
});

describe('booking reducer · what is being booked', () => {
  it('drops the selection and the calendar when the duration changes', () => {
    const details = reachDetails();
    const rescheduled = bookingReducer(details, { type: 'setDuration', duration: 30 });

    expect(rescheduled.duration).toBe(30);
    expect(rescheduled.step).toBe('date');
    expect(rescheduled.selectedDate).toBe('2026-05-18');
    expect(rescheduled.selectedSlot).toBeNull();
    expect(rescheduled.selectionStatus).toBe('none');
    expect(rescheduled.selectionReason).toBe('duration-change');
    expect(rescheduled.slots).toEqual([]);
    expect(rescheduled.days).toEqual({});
    expect(rescheduled.daysStatus).toBe('idle');
  });

  it('is a no-op for a repeated duration', () => {
    const state = base();
    expect(bookingReducer(state, { type: 'setDuration', duration: 15 })).toBe(state);
  });

  it('clears the selection after a conflict but keeps the form', () => {
    const details = bookingReducer(reachDetails(), {
      type: 'setValues',
      values: { name: 'Ann', email: 'ann@example.com' },
    });
    const cleared = bookingReducer(details, {
      type: 'clearSelection',
      reason: 'availability-change',
    });

    expect(cleared.selectedSlot).toBeNull();
    expect(cleared.selectionStatus).toBe('none');
    expect(cleared.selectionReason).toBe('availability-change');
    expect(cleared.step).toBe('time');
    expect(cleared.values).toEqual({ name: 'Ann', email: 'ann@example.com' });
    expect(cleared.scenarioId).toBe(details.scenarioId + 1);
  });

  it('clears the selection on a context change but keeps the form', () => {
    const details = bookingReducer(reachDetails(), {
      type: 'setValues',
      values: { name: 'Ann', email: 'ann@example.com' },
    });
    const changed = bookingReducer(details, { type: 'contextChanged' });

    expect(changed.selectedSlot).toBeNull();
    expect(changed.selectedDate).toBeNull();
    expect(changed.step).toBe('date');
    expect(changed.selectionReason).toBe('context-change');
    expect(changed.days).toEqual({});
    expect(changed.slots).toEqual([]);
    expect(changed.values).toEqual({ name: 'Ann', email: 'ann@example.com' });
  });
});

/* -------------------------------------------------------------------------- */
/*  Stage A: the date and the zone must stay consistent                        */
/* -------------------------------------------------------------------------- */

describe('booking reducer · external time zone change', () => {
  it('moves the calendar to the new local day and re-checks the same offer', () => {
    const details = reachDetails();

    const verifying = bookingReducer(details, {
      type: 'selectionVerifying',
      reason: 'time-zone-change',
      date: '2026-05-19',
    });

    expect(verifying.selectedDate).toBe('2026-05-19');
    // The offer is kept: it is the same instant, only its local day changed.
    expect(verifying.selectedSlot?.id).toBe(SLOT_ID);
    expect(verifying.selectionStatus).toBe('verifying');
    expect(verifying.selectionReason).toBe('time-zone-change');
    expect(verifying.slotsStatus).toBe('loading');
    // The scenario is untouched: the user is booking the same offer.
    expect(verifying.scenarioId).toBe(details.scenarioId);
  });

  it('blocks submission until the offer is confirmed again', () => {
    const verifying = bookingReducer(reachDetails(), {
      type: 'selectionVerifying',
      reason: 'time-zone-change',
      date: '2026-05-19',
    });

    // An unverified offer must never reach the adapter.
    expect(startAttempt(verifying)).toBe(verifying);

    const confirmed = bookingReducer(verifying, {
      type: 'slotsLoaded',
      token: verifying.slotsToken,
      slots: [slot()],
    });

    // `slotsLoaded` carries the token registered by `selectionVerifying`.
    expect(confirmed.slotsStatus).toBe('ready');
    expect(confirmed.selectionStatus).toBe('valid');
    expect(startAttempt(confirmed).submitStatus).toBe('submitting');
  });

  it('rejects the offer once the fresh list no longer contains it', () => {
    const verifying = bookingReducer(reachDetails(), {
      type: 'selectionVerifying',
      reason: 'time-zone-change',
      date: '2026-05-19',
    });
    const loaded = bookingReducer(verifying, {
      type: 'slotsLoading',
      token: verifying.slotsToken + 1,
    });
    const rejected = bookingReducer(loaded, {
      type: 'slotsLoaded',
      token: loaded.slotsToken,
      slots: [slot(OTHER_SLOT_ID, '2026-05-18T10:15:00Z')],
    });

    expect(rejected.selectionStatus).toBe('invalid');
    // The reason stays the user-facing one: the zone change caused the re-check.
    expect(rejected.selectionReason).toBe('time-zone-change');
    expect(startAttempt(rejected)).toBe(rejected);
  });

  it('keeps the freshest copy of the offer the adapter returned', () => {
    const verifying = bookingReducer(reachDetails(), {
      type: 'selectionVerifying',
      reason: 'time-zone-change',
    });
    const enriched = { ...slot(), data: { price: 42 } };
    const loaded = bookingReducer(verifying, {
      type: 'slotsLoading',
      token: verifying.slotsToken + 1,
    });
    const confirmed = bookingReducer(loaded, {
      type: 'slotsLoaded',
      token: loaded.slotsToken,
      slots: [enriched],
    });

    expect(confirmed.selectedSlot?.data).toEqual({ price: 42 });
  });
});

describe('booking reducer · preset selection', () => {
  it('starts unverified and becomes usable only after the adapter confirms it', () => {
    const state = base({ selection: { date: '2026-05-18', slot: slot() } });

    expect(state.step).toBe('date');
    expect(state.selectionStatus).toBe('verifying');
    expect(state.selectionNonce).toBe(1);
    expect(startAttempt(state)).toBe(state);

    const loaded = bookingReducer(state, {
      type: 'slotsLoading',
      token: state.slotsToken + 1,
    });
    const confirmed = bookingReducer(loaded, {
      type: 'slotsLoaded',
      token: loaded.slotsToken,
      slots: [slot()],
    });

    expect(confirmed.selectionStatus).toBe('valid');
    expect(startAttempt(confirmed).submitStatus).toBe('submitting');
  });

  it('leaves the step alone: where the user stands is the binding’s decision', () => {
    const state = base({ selection: { date: '2026-05-18', slot: slot() } });
    const loaded = bookingReducer(state, { type: 'slotsLoading', token: 1 });
    const confirmed = bookingReducer(loaded, { type: 'slotsLoaded', token: 1, slots: [slot()] });

    expect(confirmed.step).toBe('date');
  });
});

/* -------------------------------------------------------------------------- */
/*  The attempt: one creation request, settled only by its own key             */
/* -------------------------------------------------------------------------- */

describe('booking reducer · creating a booking', () => {
  it('refuses to start an attempt without a confirmed offer', () => {
    const onCalendar = base();

    expect(startAttempt(onCalendar)).toBe(onCalendar);
  });

  it('freezes the request and clears the previous server errors', () => {
    const withErrors = bookingReducer(reachDetails(), {
      type: 'setFieldErrors',
      fieldErrors: { phone: 'Invalid' },
      formError: 'Fix the form',
    });
    const submitting = startAttempt(withErrors);

    expect(submitting.submitStatus).toBe('submitting');
    expect(submitting.fieldErrors).toEqual({});
    expect(submitting.formError).toBeNull();
    expect(submitting.attempt?.request.idempotencyKey).toBe('key-1');
    expect(submitting.attempt?.startedAt).toBe(1_000);
  });

  it('confirms the attempted scenario', () => {
    const submitting = startAttempt(reachDetails());
    const confirmed = bookingReducer(submitting, {
      type: 'submitSucceeded',
      idempotencyKey: 'key-1',
      result: bookedResult(),
    });

    expect(confirmed.step).toBe('confirmed');
    expect(confirmed.submitStatus).toBe('success');
    expect(confirmed.result?.id).toBe('booking-1');
    expect(confirmed.attempt).toBeNull();
  });

  it('ignores an outcome that belongs to another attempt', () => {
    const submitting = startAttempt(reachDetails());

    expect(
      bookingReducer(submitting, {
        type: 'submitSucceeded',
        idempotencyKey: 'someone-else',
        result: bookedResult(),
      }),
    ).toBe(submitting);
  });

  it('keeps the booking off the screen when the scenario moved on', () => {
    const submitting = startAttempt(reachDetails());
    const movedOn = bookingReducer(submitting, { type: 'setDuration', duration: 30 });
    const settled = bookingReducer(movedOn, {
      type: 'submitSucceeded',
      idempotencyKey: 'key-1',
      result: bookedResult(),
    });

    // The attempt is settled — the booking exists — but the user is elsewhere.
    expect(settled.attempt).toBeNull();
    expect(settled.step).toBe('date');
    expect(settled.result).toBeNull();
    expect(settled.submitStatus).toBe('idle');
  });

  it('settles a guaranteed failure back on the form with the reason', () => {
    const submitting = startAttempt(reachDetails());
    const failed = bookingReducer(submitting, {
      type: 'submitFailed',
      idempotencyKey: 'key-1',
      error: 'Проверьте данные',
      fieldErrors: { phone: 'Invalid number' },
      formError: 'Fix the form',
    });

    expect(failed.attempt).toBeNull();
    expect(failed.step).toBe('details');
    expect(failed.direction).toBe(-1);
    expect(failed.submitStatus).toBe('error');
    expect(failed.submitError).toBe('Проверьте данные');
    expect(failed.fieldErrors).toEqual({ phone: 'Invalid number' });
    expect(failed.formError).toBe('Fix the form');
  });

  it('moves to the attempt screen when the outcome cannot be established', () => {
    const submitting = startAttempt(reachDetails());
    const unresolved = bookingReducer(submitting, {
      type: 'submitUnknown',
      idempotencyKey: 'key-1',
    });

    expect(unresolved.step).toBe('attempt');
    expect(unresolved.submitStatus).toBe('unresolved');
    expect(unresolved.attempt?.status).toBe('unknown');
    // Nothing may start a second creation while the first is unresolved…
    expect(startAttempt(unresolved)).toBe(unresolved);
    // …and the screen is terminal: leaving it is not an escape hatch.
    expect(bookingReducer(unresolved, { type: 'back' })).toBe(unresolved);
  });

  it('repeats the frozen attempt with the same key and the same start time', () => {
    const unresolved = bookingReducer(startAttempt(reachDetails()), {
      type: 'submitUnknown',
      idempotencyKey: 'key-1',
    });
    const before = unresolved.attempt;

    const retrying = bookingReducer(unresolved, { type: 'attemptRetryStart' });

    expect(retrying.submitStatus).toBe('submitting');
    expect(retrying.attempt?.status).toBe('pending');
    expect(retrying.attempt?.idempotencyKey).toBe(before?.idempotencyKey);
    expect(retrying.attempt?.startedAt).toBe(before?.startedAt);
    expect(retrying.attempt?.request).toBe(before?.request);
  });

  it('refuses to retry an attempt that is not unresolved', () => {
    const submitting = startAttempt(reachDetails());

    expect(bookingReducer(submitting, { type: 'attemptRetryStart' })).toBe(submitting);
    expect(bookingReducer(base(), { type: 'attemptRetryStart' })).toEqual(base());
  });
});

describe('booking reducer · resolving an attempt', () => {
  function unresolved(): BookingState {
    return bookingReducer(startAttempt(reachDetails()), {
      type: 'submitUnknown',
      idempotencyKey: 'key-1',
    });
  }

  it('shows the result when the application confirms the booking exists', () => {
    const resolved = bookingReducer(unresolved(), {
      type: 'resolveAttempt',
      outcome: { status: 'created', result: bookedResult('found') },
    });

    expect(resolved.step).toBe('confirmed');
    expect(resolved.submitStatus).toBe('success');
    expect(resolved.result?.id).toBe('found');
    expect(resolved.attempt).toBeNull();
  });

  it('returns to the form and allows a new operation when nothing was created', () => {
    const resolved = bookingReducer(unresolved(), {
      type: 'resolveAttempt',
      outcome: { status: 'not_created' },
      message: 'The booking was not created.',
    });

    expect(resolved.attempt).toBeNull();
    expect(resolved.submitStatus).toBe('idle');
    expect(resolved.step).toBe('details');
    expect(resolved.formError).toBe('The booking was not created.');

    // A new deliberate operation gets a new attempt and its own key.
    const again = startAttempt(resolved, 'key-2');
    expect(again.submitStatus).toBe('submitting');
    expect(again.attempt?.idempotencyKey).toBe('key-2');
  });

  it('falls back to the calendar when the draft is already gone', () => {
    const afterReset = bookingReducer(unresolved(), { type: 'reset' });
    expect(afterReset.step).toBe('attempt');
    expect(afterReset.values).toEqual(EMPTY_BOOKING_VALUES);

    const resolved = bookingReducer(afterReset, {
      type: 'resolveAttempt',
      outcome: { status: 'not_created' },
    });

    expect(resolved.step).toBe('date');
    expect(resolved.attempt).toBeNull();
  });

  it('keeps the block while the outcome stays unknown', () => {
    const state = unresolved();

    expect(bookingReducer(state, { type: 'resolveAttempt', outcome: { status: 'unknown' } })).toBe(
      state,
    );
  });

  it('ignores a resolution when there is no attempt', () => {
    const state = reachDetails();

    expect(
      bookingReducer(state, { type: 'resolveAttempt', outcome: { status: 'not_created' } }),
    ).toBe(state);
  });

  it('restores a pending attempt as unresolved', () => {
    const restored = bookingReducer(base(), {
      type: 'restoreAttempt',
      attempt: { ...attemptFor(base(), 'restored'), status: 'pending' },
    });

    expect(restored.step).toBe('attempt');
    expect(restored.submitStatus).toBe('unresolved');
    expect(restored.attempt?.status).toBe('unknown');
  });

  it('accepts a restored attempt without a scenario, so its outcome is shown', () => {
    const attempt = attemptFor(base(), 'restored');
    const { scenarioId: _ignored, ...scenarioLess } = attempt;
    const restored = bookingReducer(base(), {
      type: 'restoreAttempt',
      attempt: scenarioLess,
    });
    const resolved = bookingReducer(restored, {
      type: 'resolveAttempt',
      outcome: { status: 'created', result: bookedResult('restored-1') },
    });

    expect(resolved.step).toBe('confirmed');
    expect(resolved.result?.id).toBe('restored-1');
  });
});

describe('booking reducer · form values and errors', () => {
  it('tracks touched fields once', () => {
    const touched = bookingReducer(base(), { type: 'touch', field: 'name' });

    expect(touched.touched.name).toBe(true);
    expect(bookingReducer(touched, { type: 'touch', field: 'name' })).toBe(touched);
  });

  it('is a no-op when the values did not change', () => {
    const state = base({ values: { name: 'Ann', email: 'ann@example.com' } });

    expect(
      bookingReducer(state, {
        type: 'setValues',
        values: { name: 'Ann', email: 'ann@example.com' },
      }),
    ).toBe(state);
  });

  it('clears the server error of the field the user edited, and only that one', () => {
    const failed = bookingReducer(reachDetails(), {
      type: 'setFieldErrors',
      fieldErrors: { name: 'Taken', phone: 'Invalid' },
      formError: 'Fix the form',
    });

    const edited = bookingReducer(failed, {
      type: 'setValues',
      values: { ...failed.values, name: 'Ann' },
    });

    expect(edited.fieldErrors).toEqual({ phone: 'Invalid' });
    expect(edited.formError).toBeNull();
  });

  it('clears a single field error on request', () => {
    const failed = bookingReducer(reachDetails(), {
      type: 'setFieldErrors',
      fieldErrors: { name: 'Taken' },
    });

    expect(bookingReducer(failed, { type: 'clearFieldError', field: 'name' }).fieldErrors).toEqual(
      {},
    );
    expect(bookingReducer(failed, { type: 'clearFieldError', field: 'email' })).toBe(failed);
  });
});

describe('booking reducer · reset', () => {
  it('clears the draft, keeps the calendar warm and restores the initial values', () => {
    const details = bookingReducer(reachDetails(), {
      type: 'setValues',
      values: { name: 'Ann', email: 'ann@example.com' },
    });
    const withDays: BookingState = {
      ...details,
      days: { '2026-05-04': { date: '2026-05-04', slotCount: 2 } },
      daysStatus: 'ready',
    };

    const reset = bookingReducer(withDays, {
      type: 'reset',
      values: { name: '', email: '' },
    });

    expect(reset.step).toBe('date');
    expect(reset.selectedDate).toBeNull();
    expect(reset.selectedSlot).toBeNull();
    expect(reset.values).toEqual({ name: '', email: '' });
    expect(reset.touched).toEqual({});
    expect(reset.fieldErrors).toEqual({});
    expect(reset.attempt).toBeNull();
    expect(reset.days['2026-05-04']).toBeDefined();
    expect(reset.daysStatus).toBe('ready');
    expect(reset.scenarioId).toBe(withDays.scenarioId + 1);
  });

  it('keeps an unresolved attempt and the block that comes with it', () => {
    const unresolved = bookingReducer(startAttempt(reachDetails()), {
      type: 'submitUnknown',
      idempotencyKey: 'key-1',
    });
    const reset = bookingReducer(unresolved, { type: 'reset' });

    expect(reset.step).toBe('attempt');
    expect(reset.submitStatus).toBe('unresolved');
    expect(reset.attempt?.idempotencyKey).toBe('key-1');
    expect(reset.selectedSlot).toBeNull();
    expect(startAttempt(reset)).toBe(reset);
  });
});

describe('booking reducer · availability rendering', () => {
  it('indexes the days the adapter returned', () => {
    const days: DayAvailability[] = [{ date: '2026-05-04', slotCount: 2 }, { date: '2026-05-05' }];
    let state = bookingReducer(base(), { type: 'daysLoading', token: 1 });
    state = bookingReducer(state, { type: 'daysLoaded', token: 1, days });

    expect(Object.keys(state.days)).toEqual(['2026-05-04', '2026-05-05']);
    expect(state.days['2026-05-05']?.slotCount).toBeUndefined();
  });

  it('moves the visible month', () => {
    const moved = bookingReducer(base(), { type: 'setMonth', month: '2026-06' });

    expect(moved.month).toBe('2026-06');
    expect(bookingReducer(moved, { type: 'setMonth', month: '2026-06' })).toBe(moved);
  });
});
