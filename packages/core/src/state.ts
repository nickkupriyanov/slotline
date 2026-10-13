/**
 * The flow state machine: a pure reducer over an explicit action union.
 * All I/O lives in `useBookingFlow`; everything here is synchronous and testable.
 */
import type {
  SlotlineMessages,
  SlotlineStep,
  BookingDetails,
  BookingResult,
  DayAvailability,
  LoadStatus,
  TimeSlot,
} from './types';

export const FLOW_STEPS: readonly SlotlineStep[] = ['date', 'time', 'details', 'confirmed'];

export function stepIndex(step: SlotlineStep): number {
  return FLOW_STEPS.indexOf(step);
}

export interface FlowState {
  step: SlotlineStep;
  /** `1` when moving forward, `-1` when going back — drives the transition direction. */
  direction: 1 | -1;
  /** Visible month, `YYYY-MM`. */
  month: string;
  selectedDate: string | null;
  /** Bumped on every `selectDate`, so re-picking the same day refetches. */
  selectionNonce: number;
  /**
   * Bumped whenever *what* the user is booking changes: day, slot, duration,
   * navigation or reset. In-flight `createBooking` responses carry the
   * scenario they belong to and are dropped once it has moved on.
   */
  scenarioId: number;
  selectedSlot: TimeSlot | null;
  duration: number;
  days: Record<string, DayAvailability>;
  daysStatus: LoadStatus;
  daysError: string | null;
  /** Bumped on every availability request so stale responses can be dropped. */
  daysToken: number;
  slots: TimeSlot[];
  slotsStatus: LoadStatus;
  slotsError: string | null;
  slotsToken: number;
  details: BookingDetails;
  touched: Record<'name' | 'email', boolean>;
  submitStatus: 'idle' | 'submitting' | 'error' | 'success';
  submitError: string | null;
  result: BookingResult | null;
}

export interface CreateStateOptions {
  duration: number;
  month: string;
}

export function createFlowState({ duration, month }: CreateStateOptions): FlowState {
  return {
    step: 'date',
    direction: 1,
    month,
    selectedDate: null,
    selectionNonce: 0,
    scenarioId: 0,
    selectedSlot: null,
    duration,
    days: {},
    daysStatus: 'idle',
    daysError: null,
    daysToken: 0,
    slots: [],
    slotsStatus: 'idle',
    slotsError: null,
    slotsToken: 0,
    details: { name: '', email: '' },
    touched: { name: false, email: false },
    submitStatus: 'idle',
    submitError: null,
    result: null,
  };
}

export type FlowAction =
  | { type: 'setMonth'; month: string }
  | { type: 'daysLoading'; token: number }
  | { type: 'daysLoaded'; token: number; days: DayAvailability[] }
  | { type: 'daysFailed'; token: number; error: string }
  | { type: 'selectDate'; date: string }
  | { type: 'slotsLoading'; token: number }
  | { type: 'slotsLoaded'; token: number; slots: TimeSlot[] }
  | { type: 'slotsFailed'; token: number; error: string }
  | { type: 'selectSlot'; slot: TimeSlot }
  | { type: 'setDuration'; duration: number }
  | { type: 'setDetails'; details: Partial<BookingDetails> }
  | { type: 'touch'; field: 'name' | 'email' }
  | { type: 'submitStart' }
  | { type: 'submitFailed'; scenario: number; error: string }
  | { type: 'submitSucceeded'; scenario: number; result: BookingResult }
  | { type: 'back' }
  | { type: 'reset' };

function indexDays(days: DayAvailability[]): Record<string, DayAvailability> {
  const indexed: Record<string, DayAvailability> = {};
  for (const day of days) {
    if (day && typeof day.date === 'string') indexed[day.date] = day;
  }
  return indexed;
}

/** Clears everything downstream of the calendar. */
function invalidateSelection(state: FlowState): FlowState {
  return {
    ...state,
    days: {},
    daysStatus: 'idle',
    daysError: null,
    slots: [],
    slotsStatus: 'idle',
    slotsError: null,
    selectedSlot: null,
  };
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
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
        selectionNonce: state.selectionNonce + 1,
        scenarioId: state.scenarioId + 1,
        selectedSlot: null,
        slots: [],
        slotsStatus: 'loading',
        slotsError: null,
      };

    case 'slotsLoading':
      return { ...state, slotsStatus: 'loading', slotsError: null, slotsToken: action.token };

    case 'slotsLoaded':
      if (action.token !== state.slotsToken) return state;
      return { ...state, slots: action.slots, slotsStatus: 'ready', slotsError: null };

    case 'slotsFailed':
      if (action.token !== state.slotsToken) return state;
      return { ...state, slotsStatus: 'error', slotsError: action.error };

    case 'selectSlot':
      return {
        ...state,
        step: 'details',
        direction: 1,
        scenarioId: state.scenarioId + 1,
        selectedSlot: action.slot,
        submitStatus: 'idle',
        submitError: null,
      };

    case 'setDuration':
      if (action.duration === state.duration) return state;
      return {
        ...invalidateSelection({ ...state, duration: action.duration }),
        step: 'date',
        scenarioId: state.scenarioId + 1,
      };

    case 'setDetails':
      return { ...state, details: { ...state.details, ...action.details } };

    case 'touch':
      if (state.touched[action.field]) return state;
      return { ...state, touched: { ...state.touched, [action.field]: true } };

    case 'submitStart':
      return { ...state, submitStatus: 'submitting', submitError: null };

    case 'submitFailed':
      if (action.scenario !== state.scenarioId) return state;
      return { ...state, submitStatus: 'error', submitError: action.error };

    case 'submitSucceeded':
      // A response belonging to a scenario the user has left — a reset, a
      // different slot, even the same slot picked again — must not move the UI.
      if (action.scenario !== state.scenarioId) return state;
      return {
        ...state,
        step: 'confirmed',
        direction: 1,
        submitStatus: 'success',
        submitError: null,
        result: action.result,
      };

    case 'back': {
      if (state.step === 'details') {
        return {
          ...state,
          step: 'time',
          direction: -1,
          scenarioId: state.scenarioId + 1,
          submitStatus: 'idle',
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
        };
      }
      return state;
    }

    case 'reset':
      return {
        ...createFlowState({ duration: state.duration, month: state.month }),
        // Keep the fetched month so "Book another" lands on a warm calendar.
        days: state.days,
        daysStatus: state.daysStatus,
        // Monotonic: a response from the abandoned scenario can never match.
        scenarioId: state.scenarioId + 1,
      };

    default:
      return state;
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface FieldErrors {
  name?: string;
  email?: string;
}

export function validateDetails(
  details: BookingDetails,
  messages: SlotlineMessages,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!details.name.trim()) errors.name = messages.nameRequired;
  if (!details.email.trim()) {
    errors.email = messages.emailRequired;
  } else if (!EMAIL_RE.test(details.email.trim())) {
    errors.email = messages.emailInvalid;
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Boolean(errors.name || errors.email);
}

/** Errors that should be visible right now (untouched fields stay quiet). */
export function visibleErrors(
  errors: FieldErrors,
  touched: Record<'name' | 'email', boolean>,
): FieldErrors {
  const visible: FieldErrors = {};
  if (touched.name && errors.name) visible.name = errors.name;
  if (touched.email && errors.email) visible.email = errors.email;
  return visible;
}

export function countSlots(day: DayAvailability | undefined): number | undefined {
  if (!day) return undefined;
  if (typeof day.slotCount === 'number') return day.slotCount;
  return day.slots?.length;
}
