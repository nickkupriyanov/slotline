import { describe, expect, it } from 'vitest';
import { defaultMessages } from './i18n';
import {
  countSlots,
  createFlowState,
  flowReducer,
  hasErrors,
  stepIndex,
  validateDetails,
  visibleErrors,
} from './state';

const messages = defaultMessages.en;

function base() {
  return createFlowState({ duration: 15, month: '2026-05' });
}

describe('flow reducer', () => {
  it('starts on the calendar', () => {
    const state = base();
    expect(state.step).toBe('date');
    expect(state.duration).toBe(15);
    expect(state.daysStatus).toBe('idle');
    expect(stepIndex(state.step)).toBe(0);
  });

  it('moves forward from date to time to details', () => {
    let state = flowReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    expect(state.step).toBe('time');
    expect(state.direction).toBe(1);
    expect(state.slotsStatus).toBe('loading');

    state = flowReducer(state, { type: 'slotsLoaded', token: state.slotsToken, slots: [{ start: 'x' }] });
    expect(state.slots).toHaveLength(1);

    state = flowReducer(state, { type: 'selectSlot', slot: { start: '2026-05-18T09:15:00Z' } });
    expect(state.step).toBe('details');
    expect(state.selectedSlot?.start).toBe('2026-05-18T09:15:00Z');
  });

  it('goes back one step and flips the animation direction', () => {
    let state = flowReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    state = flowReducer(state, { type: 'selectSlot', slot: { start: 'x' } });
    state = flowReducer(state, { type: 'back' });
    expect(state.step).toBe('time');
    expect(state.direction).toBe(-1);

    state = flowReducer(state, { type: 'back' });
    expect(state.step).toBe('date');
    expect(state.selectedSlot).toBeNull();

    // Nothing above the calendar: the action is a no-op.
    expect(flowReducer(state, { type: 'back' })).toBe(state);
  });

  it('ignores stale availability responses', () => {
    let state = flowReducer(base(), { type: 'daysLoading', token: 7 });
    state = flowReducer(state, { type: 'daysLoading', token: 8 });
    const stale = flowReducer(state, {
      type: 'daysLoaded',
      token: 7,
      days: [{ date: '2026-05-04', slotCount: 3 }],
    });
    expect(stale).toBe(state);

    const fresh = flowReducer(state, {
      type: 'daysLoaded',
      token: 8,
      days: [{ date: '2026-05-04', slotCount: 3 }],
    });
    expect(fresh.daysStatus).toBe('ready');
    expect(fresh.days['2026-05-04']?.slotCount).toBe(3);
  });

  it('drops the whole selection when the duration changes', () => {
    let state = flowReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    state = flowReducer(state, { type: 'selectSlot', slot: { start: 'x' } });
    state = flowReducer(state, { type: 'setDuration', duration: 30 });

    expect(state.duration).toBe(30);
    expect(state.step).toBe('date');
    expect(state.selectedDate).toBe('2026-05-18');
    expect(state.selectedSlot).toBeNull();
    expect(state.slots).toEqual([]);
    expect(state.daysStatus).toBe('idle');
  });

  it('bumps the selection nonce so the same day can be re-picked', () => {
    const first = flowReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    expect(first.selectionNonce).toBe(1);

    // Clicking the same day while already on the time step stays a no-op.
    expect(flowReducer(first, { type: 'selectDate', date: '2026-05-18' })).toBe(first);

    // Going back and picking it again has to re-trigger the load.
    const backToCalendar = flowReducer(first, { type: 'back' });
    const again = flowReducer(backToCalendar, {
      type: 'selectDate',
      date: '2026-05-18',
    });
    expect(again.selectionNonce).toBe(2);
    expect(again.slotsStatus).toBe('loading');
  });

  it('is a no-op for a repeated duration', () => {
    const state = base();
    expect(flowReducer(state, { type: 'setDuration', duration: 15 })).toBe(state);
  });

  it('records submission results', () => {
    let state = flowReducer(base(), { type: 'submitStart' });
    expect(state.submitStatus).toBe('submitting');
    const scenario = state.scenarioId;

    state = flowReducer(state, { type: 'submitFailed', scenario, error: 'nope' });
    expect(state.submitStatus).toBe('error');
    expect(state.submitError).toBe('nope');

    state = flowReducer(state, { type: 'submitSucceeded', scenario, result: { id: '1' } });
    expect(state.step).toBe('confirmed');
    expect(state.result).toEqual({ id: '1' });
  });

  it('ignores a response from an abandoned scenario', () => {
    let state = flowReducer(base(), { type: 'selectDate', date: '2026-05-18' });
    state = flowReducer(state, { type: 'selectSlot', slot: { start: 'x' } });
    state = flowReducer(state, { type: 'submitStart' });
    const scenario = state.scenarioId;

    // The consumer abandons the flow while the request is in flight…
    const abandoned = flowReducer(state, { type: 'reset' });
    expect(
      flowReducer(abandoned, { type: 'submitSucceeded', scenario, result: { id: 'late' } }),
    ).toBe(abandoned);
    expect(
      flowReducer(abandoned, { type: 'submitFailed', scenario, error: 'late' }),
    ).toBe(abandoned);

    // …while the live scenario still accepts the very same response.
    const accepted = flowReducer(state, {
      type: 'submitSucceeded',
      scenario,
      result: { id: 'ok' },
    });
    expect(accepted.step).toBe('confirmed');
    expect(accepted.result).toEqual({ id: 'ok' });
  });

  it('bumps the scenario on every change of what is being booked', () => {
    const start = base();
    const dated = flowReducer(start, { type: 'selectDate', date: '2026-05-18' });
    const slotted = flowReducer(dated, { type: 'selectSlot', slot: { start: 'x' } });
    const backed = flowReducer(slotted, { type: 'back' });
    const rescheduled = flowReducer(backed, { type: 'setDuration', duration: 30 });
    const reset = flowReducer(rescheduled, { type: 'reset' });

    expect(
      [start, dated, slotted, backed, rescheduled, reset].map((state) => state.scenarioId),
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('resets the flow but keeps the calendar warm', () => {
    let state = flowReducer(base(), { type: 'daysLoading', token: 1 });
    state = flowReducer(state, { type: 'daysLoaded', token: 1, days: [{ date: '2026-05-04' }] });
    state = flowReducer(state, { type: 'selectDate', date: '2026-05-04' });
    state = flowReducer(state, { type: 'reset' });

    expect(state.step).toBe('date');
    expect(state.selectedDate).toBeNull();
    expect(state.details).toEqual({ name: '', email: '' });
    expect(state.days['2026-05-04']).toBeDefined();
  });

  it('tracks touched fields once', () => {
    let state = flowReducer(base(), { type: 'touch', field: 'name' });
    expect(state.touched.name).toBe(true);
    expect(flowReducer(state, { type: 'touch', field: 'name' })).toBe(state);
  });
});

describe('validation', () => {
  it('requires a name and a valid email', () => {
    expect(validateDetails({ name: '', email: '' }, messages)).toEqual({
      name: messages.nameRequired,
      email: messages.emailRequired,
    });
    expect(validateDetails({ name: 'Ann', email: 'ann@' }, messages).email).toBe(
      messages.emailInvalid,
    );
    expect(hasErrors(validateDetails({ name: 'Ann', email: 'ann@example.com' }, messages))).toBe(
      false,
    );
  });

  it('hides errors for untouched fields', () => {
    const errors = validateDetails({ name: '', email: 'bad' }, messages);
    expect(visibleErrors(errors, { name: false, email: false })).toEqual({});
    expect(visibleErrors(errors, { name: true, email: false })).toEqual({
      name: messages.nameRequired,
    });
  });
});

describe('availability helpers', () => {
  it('prefers slotCount but falls back to the slot list', () => {
    expect(countSlots({ date: '2026-05-04', slotCount: 4 })).toBe(4);
    expect(countSlots({ date: '2026-05-04', slots: [{ start: 'a' }, { start: 'b' }] })).toBe(2);
    expect(countSlots(undefined)).toBeUndefined();
  });
});
