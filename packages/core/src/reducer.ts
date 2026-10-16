/**
 * The booking flow state machine.
 *
 * Pure and synchronous: it never reads the clock, never touches the DOM and never
 * performs I/O. The controller owns requests, cancellation and the time anchor;
 * everything here is a deterministic transition that can be replayed in a test.
 *
 * Two ideas carry most of the design:
 *
 * - A **scenario** is "what is being booked" — day, offer, duration, schedule. It
 *   is bumped whenever that changes, and it decides whether a resolved attempt may
 *   still move the screen.
 * - An **attempt** is one creation request, frozen at the first send. It lives
 *   outside the scenario: a reset does not drop it, and only its own idempotency
 *   key can settle it, so a late response can never be mistaken for another one.
 */
import { DEFAULT_BOOKING_FIELDS, createEmptyValues } from './fields';
import { DEFAULT_MODE, type BookingMode } from './config';
import type {
  BookingAttemptOutcome,
  BookingErrorCode,
  BookingRequest,
  BookingResult,
  BookingValues,
  DayAvailability,
  LoadStatus,
  SelectionChangeReason,
  SlotlineStep,
  TimeSlot,
} from './types';

/** How much the flow trusts the current selection. */
export type SelectionStatus = 'none' | 'verifying' | 'valid' | 'invalid';

export type SubmitStatus = 'idle' | 'submitting' | 'unresolved' | 'error' | 'success';

/** Values the built-in form starts with. */
/** Values the built-in form starts with: the default field list, empty. */
export const EMPTY_BOOKING_VALUES: BookingValues = createEmptyValues(DEFAULT_BOOKING_FIELDS);

/** One creation attempt, frozen at the first send and reused by every repeat. */
export interface BookingAttemptState {
  idempotencyKey: string;
  /**
   * The request exactly as it was sent. The form payload is typed by the
   * application, so the flow keeps it as plain values and the adapter call casts
   * it back to what the adapter declared.
   */
  request: Readonly<BookingRequest<BookingValues>>;
  /** Unix time in milliseconds, set before the first send and never moved. */
  startedAt: number;
  status: 'pending' | 'unknown';
  /**
   * The scenario the attempt belongs to. Absent for an attempt restored by the
   * application: it was settled deliberately, so its outcome is always shown.
   */
  scenarioId?: number;
}

export interface BookingState {
  /** The flow's mode, fixed at creation: a selection ends at the offer. */
  mode: BookingMode;
  step: SlotlineStep;
  /** `1` when moving forward, `-1` when going back — drives the transition direction. */
  direction: 1 | -1;
  /** Visible month, `YYYY-MM`. */
  month: string;
  selectedDate: string | null;
  selectedSlot: TimeSlot | null;
  selectionStatus: SelectionStatus;
  /** Why the selection stopped being usable, for the message the user sees. */
  selectionReason: SelectionChangeReason | null;
  /** Bumped on every `selectDate`, so re-picking the same day refetches. */
  selectionNonce: number;
  /** Bumped whenever *what* is being booked changes; late attempts are dropped. */
  scenarioId: number;
  duration: number;
  values: BookingValues;
  touched: Record<string, boolean>;
  /** Field errors the server reported, keyed by field name. */
  fieldErrors: Record<string, string>;
  /** An error that belongs to no known field, or to the form as a whole. */
  formError: string | null;
  days: Record<string, DayAvailability>;
  daysStatus: LoadStatus;
  daysError: string | null;
  /** Bumped on every availability request so stale responses can be dropped. */
  daysToken: number;
  slots: TimeSlot[];
  slotsStatus: LoadStatus;
  slotsError: string | null;
  slotsToken: number;
  attempt: BookingAttemptState | null;
  submitStatus: SubmitStatus;
  submitError: string | null;
  result: BookingResult | null;
}

export interface CreateBookingStateOptions {
  mode?: BookingMode;
  duration: number;
  month: string;
  values?: BookingValues;
  /** A restored attempt: the flow opens on the attempt screen, blocked. */
  attempt?: BookingAttemptState | null;
  /** A pre-selected offer, checked against availability before it can be used. */
  selection?: { date: string; slot: TimeSlot | null } | null;
}

export function createBookingState({
  mode = DEFAULT_MODE,
  duration,
  month,
  values,
  attempt = null,
  selection = null,
}: CreateBookingStateOptions): BookingState {
  return {
    mode,
    step: attempt ? 'attempt' : 'date',
    direction: 1,
    month,
    selectedDate: selection?.date ?? null,
    selectedSlot: selection?.slot ?? null,
    selectionStatus: selection?.slot ? 'verifying' : 'none',
    selectionReason: null,
    selectionNonce: selection ? 1 : 0,
    scenarioId: 0,
    duration,
    values: { ...(values ?? EMPTY_BOOKING_VALUES) },
    touched: {},
    fieldErrors: {},
    formError: null,
    days: {},
    daysStatus: 'idle',
    daysError: null,
    daysToken: 0,
    slots: [],
    slotsStatus: 'idle',
    slotsError: null,
    slotsToken: 0,
    attempt,
    submitStatus: attempt ? 'unresolved' : 'idle',
    submitError: null,
    result: null,
  };
}

export type BookingAction =
  | { type: 'setMonth'; month: string }
  | { type: 'daysLoading'; token: number }
  | { type: 'daysLoaded'; token: number; days: DayAvailability[] }
  | { type: 'daysFailed'; token: number; error: string }
  | { type: 'selectDate'; date: string; reason?: SelectionChangeReason }
  | { type: 'slotsLoading'; token: number }
  | { type: 'slotsLoaded'; token: number; slots: TimeSlot[] }
  | { type: 'slotsFailed'; token: number; error: string }
  | { type: 'selectSlot'; slot: TimeSlot }
  | { type: 'selectionVerifying'; reason: SelectionChangeReason; date?: string }
  | {
      type: 'selectionPreset';
      date: string;
      slot: TimeSlot | null;
      /**
       * `valid` is the echo of a proposal the controller made from data it had
       * just fetched; anything else has to be confirmed against availability.
       */
      status?: 'verifying' | 'valid';
      reason?: SelectionChangeReason;
    }
  | { type: 'selectionRejected'; reason: SelectionChangeReason }
  | { type: 'clearSelection'; reason: SelectionChangeReason }
  | { type: 'contextChanged' }
  | { type: 'setDuration'; duration: number }
  | { type: 'setValues'; values: BookingValues }
  | { type: 'touch'; field: string }
  | { type: 'setFieldErrors'; fieldErrors: Record<string, string>; formError?: string | null }
  | { type: 'clearFieldError'; field: string }
  | { type: 'submitStart'; attempt: BookingAttemptState }
  | { type: 'attemptRetryStart' }
  | { type: 'submitSucceeded'; idempotencyKey: string; result: BookingResult }
  | {
      type: 'submitFailed';
      idempotencyKey: string;
      error: string;
      fieldErrors?: Record<string, string>;
      formError?: string | null;
      code?: BookingErrorCode;
    }
  | { type: 'submitUnknown'; idempotencyKey: string }
  | { type: 'resolveAttempt'; outcome: BookingAttemptOutcome; message?: string }
  | { type: 'restoreAttempt'; attempt: BookingAttemptState }
  | { type: 'back' }
  | { type: 'reset'; values?: BookingValues };

function indexDays(days: DayAvailability[]): Record<string, DayAvailability> {
  const indexed: Record<string, DayAvailability> = {};
  for (const day of days) {
    if (day && typeof day.date === 'string') indexed[day.date] = day;
  }
  return indexed;
}

/** Clears everything downstream of the calendar: the offers and the selection. */
function invalidateSelection(state: BookingState): BookingState {
  return {
    ...state,
    days: {},
    daysStatus: 'idle',
    daysError: null,
    slots: [],
    slotsStatus: 'idle',
    slotsError: null,
    selectedSlot: null,
    selectionStatus: 'none',
  };
}

/**
 * Re-checks a selection that was marked as needing verification.
 *
 * Only a fresh offer list can settle it: the offer has to still be there, by id.
 * The step is deliberately left alone — where the user stands is the binding's
 * decision, not the reducer's.
 */
function reconcileSelection(state: BookingState): BookingState {
  if (state.selectionStatus !== 'verifying' || !state.selectedSlot) return state;

  const fresh = state.slots.find((slot) => slot.id === state.selectedSlot?.id);
  if (!fresh) {
    // An offer the calendar no longer publishes is not selected: the date stays
    // where it was, and the change feed tells the owner the offer is gone.
    return {
      ...state,
      selectedSlot: null,
      selectionStatus: 'invalid',
      selectionReason: state.selectionReason ?? 'availability-change',
    };
  }
  // Keep the freshest copy: an adapter may enrich the offer between visits.
  return { ...state, selectionStatus: 'valid', selectedSlot: fresh };
}

/**
 * Keeps only what an offer is: its identity, its instant and its display data.
 *
 * A binding hands back the offer it rendered, which carries presentation fields
 * too; those must not travel into the flow, the frozen request or the adapter.
 */
function normalizeSlot(slot: TimeSlot): TimeSlot {
  return {
    id: slot.id,
    start: slot.start,
    ...(slot.end === undefined ? {} : { end: slot.end }),
    ...(slot.data === undefined ? {} : { data: slot.data }),
  };
}

function attemptMatches(state: BookingState, idempotencyKey: string): boolean {
  return state.attempt?.idempotencyKey === idempotencyKey;
}

/** A restored attempt carries no scenario, so its outcome is always relevant. */
function scenarioRelevant(state: BookingState, attempt: BookingAttemptState): boolean {
  return attempt.scenarioId === undefined || attempt.scenarioId === state.scenarioId;
}

/**
 * Where the flow rests once an attempt is settled.
 *
 * A failure or a stale outcome has to leave the attempt screen, which only exists
 * while there is an attempt: the flow falls back to whichever step the draft can
 * still be worked from.
 */
function stepAfterAttempt(state: BookingState): SlotlineStep {
  if (state.step !== 'attempt') return state.step;
  if (state.selectionStatus === 'valid' && state.selectedSlot && state.selectedDate) {
    return 'details';
  }
  return state.selectedDate ? 'time' : 'date';
}

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case 'setMonth':
      if (action.month === state.month) return state;
      return { ...state, month: action.month };

    case 'daysLoading':
      return { ...state, daysStatus: 'loading', daysError: null, daysToken: action.token };

    case 'daysLoaded':
      if (action.token !== state.daysToken) return state;
      return {
        ...state,
        days: indexDays(action.days),
        daysStatus: 'ready',
        daysError: null,
      };

    case 'daysFailed':
      if (action.token !== state.daysToken) return state;
      return { ...state, daysStatus: 'error', daysError: action.error };

    case 'selectDate':
      if (action.date === state.selectedDate && state.step === 'time') return state;
      return {
        ...state,
        step: 'time',
        direction: 1,
        selectedDate: action.date,
        selectedSlot: null,
        selectionStatus: 'none',
        selectionReason: action.reason ?? null,
        selectionNonce: state.selectionNonce + 1,
        scenarioId: state.scenarioId + 1,
        slots: [],
        slotsStatus: 'loading',
        slotsError: null,
      };

    case 'slotsLoading':
      return { ...state, slotsStatus: 'loading', slotsError: null, slotsToken: action.token };

    case 'slotsLoaded':
      if (action.token !== state.slotsToken) return state;
      return reconcileSelection({
        ...state,
        slots: action.slots,
        slotsStatus: 'ready',
        slotsError: null,
      });

    case 'slotsFailed':
      if (action.token !== state.slotsToken) return state;
      return { ...state, slotsStatus: 'error', slotsError: action.error };

    case 'selectSlot':
      return {
        ...state,
        // A selection is complete once an offer is picked; a booking still has to
        // collect its details.
        step: state.mode === 'selection' ? 'time' : 'details',
        direction: 1,
        scenarioId: state.scenarioId + 1,
        selectedSlot: normalizeSlot(action.slot),
        selectionStatus: 'valid',
        selectionReason: null,
        submitStatus: state.attempt ? state.submitStatus : 'idle',
        submitError: null,
      };

    case 'selectionVerifying':
      // The same offer, a different frame: the scenario is untouched, but the
      // offer must be confirmed again before it can be booked. `date` moves the
      // flow to the calendar day the same instant now falls on.
      return {
        ...state,
        selectedDate: action.date ?? state.selectedDate,
        selectionStatus: 'verifying',
        selectionReason: action.reason,
        slots: [],
        slotsStatus: 'loading',
        slotsError: null,
        selectionNonce: state.selectionNonce + 1,
      };

    case 'selectionPreset': {
      // The value arrives from outside, so it is trusted only as far as the owner
      // says: a fresh echo of our own proposal is already confirmed, anything else
      // is re-checked against availability first.
      const verifying = action.slot !== null && action.status !== 'valid';
      const settled =
        state.step === 'attempt' || state.step === 'confirmed'
          ? state.step
          : action.slot
            ? // A selection is complete once an offer is picked; a booking still has
              // to collect its details.
              state.mode === 'selection'
              ? 'time'
              : 'details'
            : 'time';
      return {
        ...state,
        step: settled,
        direction: 1,
        selectedDate: action.date,
        selectedSlot: action.slot ? normalizeSlot(action.slot) : null,
        selectionStatus: action.slot ? (verifying ? 'verifying' : 'valid') : 'none',
        selectionReason: action.reason ?? null,
        // Only a preset that still has to be checked asks the flow to look again:
        // the echo of a fresh proposal is already confirmed by the list it came
        // from, and a day that did not move needs no new request either.
        ...(verifying || action.date !== state.selectedDate
          ? { selectionNonce: state.selectionNonce + 1 }
          : {}),
        scenarioId: state.scenarioId + 1,
        ...(verifying ? { slots: [], slotsStatus: 'loading' as LoadStatus, slotsError: null } : {}),
        submitStatus: state.attempt ? state.submitStatus : 'idle',
        submitError: null,
      };
    }

    case 'selectionRejected':
      if (!state.selectedSlot) return state;
      return {
        ...state,
        step: state.step === 'details' ? 'time' : state.step,
        selectedSlot: null,
        selectionStatus: 'invalid',
        selectionReason: action.reason,
      };

    case 'clearSelection':
      if (!state.selectedSlot && state.selectionStatus === 'none') return state;
      return {
        ...state,
        selectedSlot: null,
        selectionStatus: 'none',
        selectionReason: action.reason,
        scenarioId: state.scenarioId + 1,
        step: state.step === 'details' ? 'time' : state.step,
        submitStatus: state.attempt ? state.submitStatus : 'idle',
        submitError: null,
      };

    case 'contextChanged':
      // A different schedule: nothing about the old selection survives — not the
      // offer, not the day it sat on — but the form the user filled in does.
      return {
        ...invalidateSelection({ ...state, days: {}, daysStatus: 'idle' }),
        step: 'date',
        direction: 1,
        selectedDate: null,
        selectionReason: 'context-change',
        scenarioId: state.scenarioId + 1,
        submitStatus: state.attempt ? state.submitStatus : 'idle',
        submitError: null,
      };

    case 'setDuration':
      if (action.duration === state.duration) return state;
      return {
        ...invalidateSelection({ ...state, duration: action.duration }),
        step: 'date',
        selectionReason: 'duration-change',
        scenarioId: state.scenarioId + 1,
      };

    case 'setValues': {
      const changed = Object.keys(action.values).filter(
        (key) => action.values[key] !== state.values[key],
      );
      if (changed.length === 0) return state;

      let fieldErrors = state.fieldErrors;
      if (changed.some((key) => key in fieldErrors)) {
        fieldErrors = { ...fieldErrors };
        for (const key of changed) delete fieldErrors[key];
      }
      return { ...state, values: action.values, fieldErrors, formError: null };
    }

    case 'touch':
      if (state.touched[action.field]) return state;
      return { ...state, touched: { ...state.touched, [action.field]: true } };

    case 'setFieldErrors':
      return {
        ...state,
        fieldErrors: action.fieldErrors,
        formError: action.formError ?? null,
      };

    case 'clearFieldError': {
      if (!(action.field in state.fieldErrors)) return state;
      const fieldErrors = { ...state.fieldErrors };
      delete fieldErrors[action.field];
      return { ...state, fieldErrors };
    }

    case 'submitStart': {
      // An unresolved attempt owns the flow: nothing may start a second one.
      if (state.attempt && state.attempt.status === 'unknown') return state;
      // An offer that is not confirmed bookable must never reach the adapter.
      if (state.selectionStatus !== 'valid' || !state.selectedSlot || !state.selectedDate) {
        return state;
      }
      return {
        ...state,
        attempt: action.attempt,
        submitStatus: 'submitting',
        submitError: null,
        fieldErrors: {},
        formError: null,
        result: null,
      };
    }

    case 'attemptRetryStart': {
      const attempt = state.attempt;
      if (!attempt || attempt.status !== 'unknown') return state;
      return {
        ...state,
        // The frozen request, the key and `startedAt` stay exactly as they were.
        attempt: { ...attempt, status: 'pending' },
        step: 'attempt',
        submitStatus: 'submitting',
        submitError: null,
      };
    }

    case 'submitSucceeded': {
      if (!attemptMatches(state, action.idempotencyKey)) return state;
      const attempt = state.attempt as BookingAttemptState;
      const settled: BookingState = { ...state, attempt: null, submitError: null };

      if (!scenarioRelevant(state, attempt)) {
        // The booking exists, but the user is looking at something else.
        return { ...settled, step: stepAfterAttempt(settled), submitStatus: 'idle' };
      }
      return {
        ...settled,
        step: 'confirmed',
        direction: 1,
        submitStatus: 'success',
        result: action.result,
      };
    }

    case 'submitFailed': {
      if (!attemptMatches(state, action.idempotencyKey)) return state;
      const attempt = state.attempt as BookingAttemptState;
      const settled: BookingState = {
        ...state,
        attempt: null,
        fieldErrors: action.fieldErrors ?? {},
        formError: action.formError ?? null,
      };

      if (!scenarioRelevant(state, attempt)) {
        return { ...settled, step: stepAfterAttempt(settled), submitStatus: 'idle' };
      }
      return {
        ...settled,
        step: stepAfterAttempt(settled),
        direction: -1,
        submitStatus: 'error',
        submitError: action.error,
      };
    }

    case 'submitUnknown': {
      if (!attemptMatches(state, action.idempotencyKey)) return state;
      const attempt = state.attempt as BookingAttemptState;
      return {
        ...state,
        // The attempt is kept, marked unresolved: only its own key can settle it.
        attempt: { ...attempt, status: 'unknown' },
        step: 'attempt',
        submitStatus: 'unresolved',
        submitError: null,
      };
    }

    case 'resolveAttempt': {
      const attempt = state.attempt;
      if (!attempt) return state;
      const { outcome } = action;
      // The public `resolveAttempt()` checks the key and answers `false` on a
      // mismatch, so by the time this action arrives the attempt is the one the
      // application meant to settle.

      if (outcome.status === 'unknown') {
        // Still unresolved: the block stays.
        if (attempt.status === 'unknown') return state;
        return {
          ...state,
          attempt: { ...attempt, status: 'unknown' },
          step: 'attempt',
          submitStatus: 'unresolved',
        };
      }

      if (outcome.status === 'created') {
        const settled: BookingState = { ...state, attempt: null, submitStatus: 'success' };
        if (!scenarioRelevant(state, attempt)) {
          return { ...settled, step: stepAfterAttempt(settled), submitStatus: 'idle' };
        }
        return {
          ...settled,
          step: 'confirmed',
          direction: 1,
          submitError: null,
          fieldErrors: {},
          formError: null,
          result: outcome.result,
        };
      }

      // `not_created`: the server finally decided no record exists, so a new
      // operation is allowed — with a new key, from wherever the draft still is.
      const settled: BookingState = {
        ...state,
        attempt: null,
        submitStatus: 'idle',
        submitError: null,
        formError: action.message ?? null,
      };
      if (state.selectionStatus === 'valid' && state.selectedSlot && state.selectedDate) {
        return { ...settled, step: 'details' };
      }
      return { ...settled, step: state.selectedDate ? 'time' : 'date' };
    }

    case 'restoreAttempt':
      return {
        ...state,
        attempt: { ...action.attempt, status: 'unknown' },
        step: 'attempt',
        submitStatus: 'unresolved',
        submitError: null,
      };

    case 'back': {
      // The attempt screen is terminal until the attempt is settled: leaving it
      // would allow a second creation for the same operation.
      if (state.step === 'attempt') return state;
      if (state.step === 'details') {
        return {
          ...state,
          step: 'time',
          direction: -1,
          scenarioId: state.scenarioId + 1,
          submitStatus: state.attempt ? state.submitStatus : 'idle',
          submitError: null,
        };
      }
      if (state.step === 'time') {
        return {
          ...state,
          step: 'date',
          direction: -1,
          scenarioId: state.scenarioId + 1,
          selectedSlot: null,
          selectionStatus: 'none',
        };
      }
      return state;
    }

    case 'reset': {
      const fresh = createBookingState({
        duration: state.duration,
        month: state.month,
        ...(action.values === undefined ? {} : { values: action.values }),
      });
      return {
        ...fresh,
        // Keep the fetched month so "Book another" lands on a warm calendar.
        days: state.days,
        daysStatus: state.daysStatus,
        // The attempt outlives the draft: a reset is not a cancellation.
        attempt: state.attempt,
        step: state.attempt ? 'attempt' : 'date',
        submitStatus: state.attempt ? 'unresolved' : 'idle',
        // Monotonic: a response from the abandoned scenario can never match.
        scenarioId: state.scenarioId + 1,
      };
    }

    default:
      return state;
  }
}
