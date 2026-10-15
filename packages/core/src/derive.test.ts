import { describe, expect, it } from 'vitest';
import { resolveBookingConfig, type BookingConfigInput } from './config';
import { countSlots, deriveBookingView, userSteps } from './derive';
import { defaultMessages } from './i18n';
import { bookingReducer, createBookingState, type BookingState } from './reducer';
import type { BookingTimeAnchor, TimeSlot } from './types';

const messages = defaultMessages.en;

const ANCHOR: BookingTimeAnchor = {
  nowMs: Date.parse('2026-05-04T09:00:00Z'),
  today: '2026-05-04',
};

const config = (input: BookingConfigInput = {}) =>
  resolveBookingConfig({
    locale: 'en',
    timeZone: 'UTC',
    minDate: '2026-05-01',
    maxDate: '2026-05-31',
    ...input,
  });

const view = (state: BookingState, input: BookingConfigInput = {}, anchor = ANCHOR) =>
  deriveBookingView(state, config(input), anchor);

const SLOT: TimeSlot = { id: '2026-05-04#0915', start: '2026-05-04T09:15:00Z' };
const OTHER: TimeSlot = { id: '2026-05-04#1015', start: '2026-05-04T10:15:00Z' };

function base(overrides: Partial<Parameters<typeof createBookingState>[0]> = {}): BookingState {
  return createBookingState({ duration: 15, month: '2026-05', ...overrides });
}

/** The calendar with a known month of availability. */
function withDays(state: BookingState = base()): BookingState {
  const loading = bookingReducer(state, { type: 'daysLoading', token: 1 });
  return bookingReducer(loading, {
    type: 'daysLoaded',
    token: 1,
    days: [
      { date: '2026-05-04', slotCount: 2 },
      { date: '2026-05-11', slotCount: 0 },
      { date: '2026-05-12' },
    ],
  });
}

/** date → time → details, with the offers loaded and one of them picked. */
function reachDetails(values?: Record<string, unknown>): BookingState {
  let state = bookingReducer(withDays(), { type: 'selectDate', date: '2026-05-04' });
  state = bookingReducer(state, { type: 'slotsLoading', token: 1 });
  state = bookingReducer(state, { type: 'slotsLoaded', token: 1, slots: [SLOT, OTHER] });
  state = bookingReducer(state, { type: 'selectSlot', slot: SLOT });
  return values ? bookingReducer(state, { type: 'setValues', values }) : state;
}

/** Starts an attempt and, optionally, leaves its outcome unknown. */
function withAttempt(state: BookingState, status: 'pending' | 'unknown', startedAt = ANCHOR.nowMs) {
  const submitted = bookingReducer(state, {
    type: 'submitStart',
    attempt: {
      idempotencyKey: 'key-1',
      request: {
        slot: SLOT,
        date: '2026-05-04',
        duration: 15,
        timeZone: 'UTC',
        context: { key: 'default' },
        values: { name: 'Ann', email: 'ann@example.com' },
        idempotencyKey: 'key-1',
      },
      startedAt,
      status: 'pending',
      scenarioId: state.scenarioId,
    },
  });
  return status === 'unknown'
    ? bookingReducer(submitted, { type: 'submitUnknown', idempotencyKey: 'key-1' })
    : submitted;
}

const bookedResult = (overrides: Record<string, unknown> = {}) => ({
  id: 'booking-1',
  status: 'confirmed' as const,
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/*  Calendar                                                                   */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · calendar', () => {
  it('builds the grid, the labels and the weekday headers', () => {
    const derived = view(base());

    expect(derived.month.key).toBe('2026-05');
    expect(derived.month.label).toBe('May 2026');
    expect(derived.month.grid).toHaveLength(42);
    expect(derived.month.grid[0]).toBe('2026-04-26');
    expect(derived.month.weekStartsOn).toBe(0);
    expect(derived.month.weekdayHeaders).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(derived.month.weekdayLongNames[0]).toBe('Sunday');
  });

  it('rotates the week when the first day is Monday', () => {
    const derived = view(base(), { weekStartsOn: 1 });

    expect(derived.month.grid[0]).toBe('2026-04-27');
    expect(derived.month.weekdayHeaders).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(derived.month.weekdayLongNames[0]).toBe('Monday');
  });

  it('describes a day exactly as the widget renders it', () => {
    const derived = view(withDays());

    expect(derived.days['2026-05-04']).toMatchObject({
      bookable: true,
      isToday: true,
      isOutside: false,
      isSelected: false,
      count: 2,
      label: 'Monday, May 4, 2 slots',
    });
    expect(derived.days['2026-05-11']).toMatchObject({
      bookable: false,
      label: 'Monday, May 11, No times available',
    });
    expect(derived.days['2026-04-26'].isOutside).toBe(true);
  });

  it('treats an unmentioned day as unavailable but a count-less day as available', () => {
    const derived = view(withDays());

    // The adapter mentioned the day without a count: it stays bookable, and the
    // label keeps saying that no times are known yet — the long-standing rule.
    expect(derived.days['2026-05-12']).toMatchObject({
      bookable: true,
      label: 'Tuesday, May 12, No times available',
    });
    // Nothing was said about this day at all.
    expect(derived.days['2026-05-13'].bookable).toBe(false);
  });

  it('marks the selected day', () => {
    const state = bookingReducer(withDays(), { type: 'selectDate', date: '2026-05-04' });

    expect(view(state).days['2026-05-04'].isSelected).toBe(true);
  });

  it('honours the allowed date range', () => {
    const state = withDays();

    expect(view(state, { minDate: '2026-05-05' }).days['2026-05-04'].bookable).toBe(false);
    expect(view(state, { maxDate: '2026-05-10' }).days['2026-05-11'].bookable).toBe(false);
  });

  it('falls back to the anchor day when no minimum is configured', () => {
    const state = withDays();
    // Without `minDate` the earliest day is "today", which comes from the anchor
    // rather than from the wall clock inside the derivation.
    const derived = deriveBookingView(
      state,
      resolveBookingConfig({ locale: 'en', timeZone: 'UTC' }),
      { nowMs: ANCHOR.nowMs, today: '2026-05-12' },
    );

    expect(derived.days['2026-05-11'].bookable).toBe(false);
    expect(derived.days['2026-05-12'].isToday).toBe(true);
    expect(derived.days['2026-05-12'].bookable).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Offers                                                                     */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · offers', () => {
  it('formats every offer and marks the selected one', () => {
    const derived = view(reachDetails());

    expect(derived.slots.items.map((item) => item.label)).toEqual(['09:15', '10:15']);
    expect(derived.slots.items.map((item) => item.selected)).toEqual([true, false]);
    expect(derived.slots.count).toBe(2);
    expect(derived.slots.countLabel).toBe('2 slots');
    expect(derived.slots.label).toBe(messages.slotsLabel);
    expect(derived.slots.loading).toBe(false);
    expect(derived.slots.empty).toBe(false);
  });

  it('formats offers in the requested hour cycle', () => {
    const derived = view(reachDetails(), { timeFormat: '12h' });

    expect(derived.slots.items[0]?.label).toBe('09:15 AM');
    expect(derived.time.label).toBe('09:15 AM');
  });

  it('reports the loading and empty states', () => {
    const loading = bookingReducer(base(), { type: 'selectDate', date: '2026-05-04' });
    expect(view(loading).slots.loading).toBe(true);
    expect(view(loading).slots.countLabel).toBeNull();

    const failed = bookingReducer(loading, { type: 'slotsFailed', token: 0, error: 'Nope' });
    expect(view(failed).slots).toMatchObject({ status: 'error', error: 'Nope' });

    const empty = bookingReducer(loading, { type: 'slotsLoaded', token: 0, slots: [] });
    expect(view(empty).slots.empty).toBe(true);
    expect(view(empty).actions.canPickAnotherDay).toBe(true);
  });

  it('shows the offset when a local time repeats', () => {
    const repeated: TimeSlot[] = [
      { id: 'a', start: '2026-10-25T00:30:00Z' },
      { id: 'b', start: '2026-10-25T01:30:00Z' },
    ];
    let state = bookingReducer(base(), { type: 'selectDate', date: '2026-10-25' });
    state = bookingReducer(state, { type: 'slotsLoaded', token: 0, slots: repeated });
    const derived = view(state, {
      timeZone: 'Europe/Berlin',
      minDate: undefined,
      maxDate: undefined,
    });

    // Both passes of the repeated hour carry their own offset.
    expect(derived.slots.items[0]?.utcOffsetLabel).toBe('UTC+02:00');
    expect(derived.slots.items[1]?.utcOffsetLabel).toBe('UTC+01:00');
    expect(derived.slots.items.map((item) => item.label)).toEqual(['02:30', '02:30']);
  });

  it('leaves a unique local time without an offset', () => {
    const derived = view(reachDetails(), { timeZone: 'Europe/Berlin' });

    expect(derived.slots.items[0]?.utcOffsetLabel).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Selection                                                                  */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · selection', () => {
  it('reports a confirmed offer as usable', () => {
    const derived = view(reachDetails());

    expect(derived.selection).toMatchObject({
      status: 'valid',
      usable: true,
      invalid: false,
      verifying: false,
      date: '2026-05-04',
    });
    expect(derived.selection.slot?.id).toBe(SLOT.id);
  });

  it('keeps an offer under re-check out of reach without calling it invalid', () => {
    const verifying = bookingReducer(reachDetails(), {
      type: 'selectionVerifying',
      reason: 'time-zone-change',
      date: '2026-05-05',
    });
    const derived = view(verifying);

    expect(derived.selection).toMatchObject({
      status: 'verifying',
      usable: false,
      verifying: true,
      invalid: false,
      reason: 'time-zone-change',
      date: '2026-05-05',
    });
    expect(derived.actions.canSubmit).toBe(false);
  });

  it('marks an offer the adapter no longer returns as invalid', () => {
    const rejected = bookingReducer(reachDetails(), {
      type: 'selectionRejected',
      reason: 'availability-change',
    });

    expect(view(rejected).selection).toMatchObject({
      status: 'invalid',
      invalid: true,
      usable: false,
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Form                                                                       */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · form', () => {
  it('reports validation errors and their visibility', () => {
    const details = reachDetails();
    const derived = view(details);

    expect(derived.form.valid).toBe(false);
    expect(derived.form.errors).toEqual({
      name: messages.nameRequired,
      email: messages.emailRequired,
    });
    expect(derived.form.visibleErrors).toEqual({});
    expect(derived.form.errorSummary).toBeNull();
  });

  it('reveals an error once the field is touched', () => {
    const touched = bookingReducer(reachDetails(), { type: 'touch', field: 'name' });
    const derived = view(touched);

    expect(derived.form.visibleErrors).toEqual({ name: messages.nameRequired });
    expect(derived.form.errorSummary).toBe(messages.formErrorsSummaryTitle);
  });

  it('accepts a filled form and clears the rule errors', () => {
    const derived = view(reachDetails({ name: 'Ann', email: 'ann@example.com' }));

    expect(derived.form.valid).toBe(true);
    expect(derived.form.errors).toEqual({});
    expect(derived.actions.canSubmit).toBe(true);
  });

  it('shows a server error immediately and lets it win over the rule', () => {
    const failed = bookingReducer(reachDetails({ name: 'Ann', email: 'ann@example.com' }), {
      type: 'setFieldErrors',
      fieldErrors: { email: 'This address is already booked' },
      formError: 'Fix the form',
    });
    const derived = view(failed);

    expect(derived.form.serverErrors).toEqual({ email: 'This address is already booked' });
    expect(derived.form.visibleErrors).toEqual({ email: 'This address is already booked' });
    expect(derived.form.formError).toBe('Fix the form');
  });

  it('hides a server error as soon as the value changes', () => {
    const failed = bookingReducer(reachDetails({ name: 'Ann', email: 'ann@example.com' }), {
      type: 'setFieldErrors',
      fieldErrors: { email: 'Taken' },
    });
    const edited = bookingReducer(failed, {
      type: 'setValues',
      values: { name: 'Ann', email: 'other@example.com' },
    });

    expect(view(edited).form.visibleErrors).toEqual({});
  });

  it('switches the submit label while the request is in flight', () => {
    const derived = view(
      withAttempt(reachDetails({ name: 'Ann', email: 'ann@example.com' }), 'pending'),
    );

    expect(derived.form.submitting).toBe(true);
    expect(derived.form.submitLabel).toBe(messages.confirming);
  });
});

/* -------------------------------------------------------------------------- */
/*  Progress, actions and announcements                                        */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · progress and actions', () => {
  it('keeps the attempt screen out of the progress', () => {
    const derived = view(withAttempt(reachDetails(), 'unknown'));

    expect(derived.step).toBe('attempt');
    expect(derived.progress.steps).not.toContain('attempt');
    expect(derived.progress).toMatchObject({ current: 3, total: 4 });
  });

  it('offers the back affordance only where there is somewhere to go', () => {
    expect(view(base()).actions.canGoBack).toBe(false);
    expect(view(reachDetails()).actions.canGoBack).toBe(true);

    const confirmed = bookingReducer(withAttempt(reachDetails(), 'pending'), {
      type: 'submitSucceeded',
      idempotencyKey: 'key-1',
      result: bookedResult(),
    });
    expect(view(confirmed).actions.canGoBack).toBe(false);
    expect(view(withAttempt(reachDetails(), 'unknown')).actions.canGoBack).toBe(false);
  });

  it('offers "book another" only after a known success', () => {
    const submitting = withAttempt(
      reachDetails({ name: 'Ann', email: 'ann@example.com' }),
      'pending',
    );
    expect(view(submitting).actions.canReset).toBe(false);

    const confirmed = bookingReducer(submitting, {
      type: 'submitSucceeded',
      idempotencyKey: 'key-1',
      result: bookedResult(),
    });
    expect(view(confirmed).actions.canReset).toBe(true);

    const unresolved = withAttempt(reachDetails(), 'unknown');
    expect(view(unresolved).actions.canReset).toBe(false);
  });

  it('announces the step, the attempt and the confirmation', () => {
    expect(view(base()).live.message).toBe('Step 1 of 4');

    const unresolved = withAttempt(reachDetails(), 'unknown');
    expect(view(unresolved).live.message).toContain(messages.attemptUnknownTitle);

    const confirmed = bookingReducer(withAttempt(reachDetails(), 'pending'), {
      type: 'submitSucceeded',
      idempotencyKey: 'key-1',
      result: bookedResult(),
    });
    const announcement = view(confirmed).live.message;
    expect(announcement).toContain(messages.bookedTitle);
    expect(announcement).toContain('Monday, May 4');
  });
});

/* -------------------------------------------------------------------------- */
/*  Attempt                                                                    */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · attempt', () => {
  const idempotent = { idempotentCreate: true as const, idempotencyRetentionMs: 3_600_000 };

  it('describes a request that is still running', () => {
    const derived = view(withAttempt(reachDetails(), 'pending'));

    expect(derived.attempt).toMatchObject({
      status: 'pending',
      title: messages.attemptPendingTitle,
      description: messages.attemptPendingDescription,
      instructions: null,
      retryAllowed: false,
      canCheckStatus: false,
    });
    expect(derived.attempt?.summary).toMatchObject({
      dateLabel: 'Monday, May 4',
      timeLabel: '09:15',
      durationLabel: '15 min',
    });
    expect(derived.attempt?.summary.values).toEqual([
      { name: 'name', label: messages.nameLabel, value: 'Ann' },
      { name: 'email', label: messages.emailLabel, value: 'ann@example.com' },
    ]);
  });

  it('offers a safe retry inside the window', () => {
    const derived = view(withAttempt(reachDetails(), 'unknown'), { capabilities: idempotent });

    expect(derived.attempt).toMatchObject({
      status: 'unknown',
      title: messages.attemptUnknownTitle,
      instructions: messages.attemptUnknownInstructions,
      retryAllowed: true,
      canCheckStatus: true,
      retryLabel: messages.retryBookingLabel,
      retryDescription: messages.retryBookingDescription,
    });
    expect(derived.actions).toMatchObject({ canRetry: true, canCheckStatus: true });
  });

  it('refuses the retry once the window has closed', () => {
    const state = withAttempt(reachDetails(), 'unknown', ANCHOR.nowMs - 2 * 3_600_000);
    const derived = view(state, { capabilities: idempotent });

    expect(derived.attempt).toMatchObject({
      retryAllowed: false,
      retryDescription: messages.retryWindowExpiredDescription,
    });
    expect(derived.actions.canRetry).toBe(false);
  });

  it('says a retry is unsafe when the adapter promises nothing', () => {
    const derived = view(withAttempt(reachDetails(), 'unknown'));

    expect(derived.attempt).toMatchObject({
      retryAllowed: false,
      retryDescription: messages.retryUnavailableDescription,
    });
  });

  it('keeps the frozen summary when the draft changes underneath', () => {
    const unresolved = withAttempt(reachDetails(), 'unknown');
    const edited = bookingReducer(unresolved, {
      type: 'setValues',
      values: { name: 'Bob', email: 'bob@example.com' },
    });
    const derived = view(edited);

    expect(derived.form.values).toEqual({ name: 'Bob', email: 'bob@example.com' });
    expect(derived.attempt?.summary.values.map((entry) => entry.value)).toEqual([
      'Ann',
      'ann@example.com',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Confirmation                                                               */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · confirmation', () => {
  function confirm(result: Record<string, unknown>) {
    return bookingReducer(withAttempt(reachDetails(), 'pending'), {
      type: 'submitSucceeded',
      idempotencyKey: 'key-1',
      result: bookedResult(result),
    });
  }

  it('summarises the booking and passes the optional details through', () => {
    const derived = view(
      confirm({
        invitation: { status: 'sent', email: 'ann@example.com' },
        location: 'Room 3',
        instructions: 'Ring the bell',
        joinUrl: 'https://meet.example.com/x',
        calendarUrl: 'https://cal.example.com/x',
        rescheduleUrl: 'https://app.example.com/reschedule',
        cancelUrl: 'https://app.example.com/cancel',
      }),
    );

    expect(derived.title).toBe(messages.bookedHeader);
    expect(derived.confirmation).toMatchObject({
      id: 'booking-1',
      status: 'confirmed',
      title: messages.bookedTitle,
      summary: 'Monday, May 4 at 09:15 for 15 min.',
      invitation: 'Calendar invite sent to ann@example.com.',
      location: 'Room 3',
      instructions: 'Ring the bell',
      joinUrl: 'https://meet.example.com/x',
      calendarUrl: 'https://cal.example.com/x',
      rescheduleUrl: 'https://app.example.com/reschedule',
      cancelUrl: 'https://app.example.com/cancel',
      bookAnotherLabel: messages.bookAnother,
    });
  });

  it('reports an invitation that has not gone out yet', () => {
    const derived = view(confirm({ invitation: { status: 'pending', email: 'ann@example.com' } }));

    expect(derived.confirmation?.invitation).toBe(
      'The calendar invite to ann@example.com is being sent.',
    );
  });

  it('reports a failed invitation', () => {
    const derived = view(confirm({ invitation: { status: 'failed', email: 'ann@example.com' } }));

    expect(derived.confirmation?.invitation).toBe(
      'The calendar invite to ann@example.com could not be sent.',
    );
  });

  it('says nothing about an invitation it knows nothing about', () => {
    expect(view(confirm({})).confirmation?.invitation).toBeNull();
    expect(view(confirm({ invitation: { status: 'sent' } })).confirmation?.invitation).toBeNull();
  });

  it('has no confirmation before a result exists', () => {
    expect(view(reachDetails()).confirmation).toBeNull();
    expect(view(withAttempt(reachDetails(), 'unknown')).confirmation).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe('deriveBookingView · purity', () => {
  it('returns deeply equal views for equal inputs', () => {
    const state = reachDetails({ name: 'Ann', email: 'ann@example.com' });

    expect(view(state)).toEqual(view(state));
  });

  it('depends on the anchor it was given, not on the wall clock', () => {
    const state = withDays();
    const early = view(state, {}, { nowMs: ANCHOR.nowMs, today: '2026-05-04' });
    const later = view(state, {}, { nowMs: ANCHOR.nowMs + 86_400_000, today: '2026-05-05' });

    expect(early.days['2026-05-04'].isToday).toBe(true);
    expect(later.days['2026-05-04'].isToday).toBe(false);
    expect(later.days['2026-05-05'].isToday).toBe(true);
  });
});

describe('countSlots', () => {
  it('prefers an explicit count and falls back to the inline offers', () => {
    expect(countSlots({ date: '2026-05-04', slotCount: 4 })).toBe(4);
    expect(
      countSlots({
        date: '2026-05-04',
        slots: [
          { id: 'a', start: '2026-05-04T09:15:00Z' },
          { id: 'b', start: '2026-05-04T10:15:00Z' },
        ],
      }),
    ).toBe(2);
  });

  it('reports nothing when the adapter said nothing', () => {
    expect(countSlots({ date: '2026-05-04' })).toBeUndefined();
    expect(countSlots(undefined)).toBeUndefined();
  });
});
