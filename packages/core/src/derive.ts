/**
 * The derived view model.
 *
 * `deriveBookingView` is pure: it receives the flow state, the resolved
 * configuration and the time reference it was given, and returns everything a
 * binding renders — labels, the calendar grid, availability, form errors, the
 * attempt summary and which actions are available.
 *
 * It never reads the clock, never touches the DOM and never calls an adapter, so
 * the controller's snapshot cache and both bindings work from one implementation
 * instead of formatting dates three times.
 */
import type { BookingConfig } from './config';
import {
  buildMonthGrid,
  compareDayKeys,
  dayKeyOfInstant,
  formatFullDay,
  formatMonthYear,
  formatTime,
  formatTimeZoneName,
  formatUtcOffset,
  isRepeatedLocalTime,
  monthKeyOf,
  rotateToWeekStart,
  shortWeekdayNames,
  weekdayNames,
} from './date';
import { validateBookingValues, visibleFieldErrors, type ResolvedBookingField } from './fields';
import { format } from './i18n';
import type { BookingState, SelectionStatus } from './reducer';
import { isRetrySafe, retryWindowClosesAt } from './time';
import type {
  BookingResult,
  BookingTimeAnchor,
  BookingValues,
  DayAvailability,
  LoadStatus,
  SelectionChangeReason,
  SlotlineStep,
  TimeFormat,
} from './types';
/* -------------------------------------------------------------------------- */
/*  View model                                                                 */
/* -------------------------------------------------------------------------- */

export interface BookingSettingsView {
  locale: string;
  timeZone: string;
  /** Short zone name at the moment that matters, e.g. `GMT+2`. */
  timeZoneName?: string;
  timeFormat: TimeFormat;
  contextKey: string;
}

export interface BookingProgressView {
  /** The steps a user walks through; the service `attempt` screen is not one. */
  steps: SlotlineStep[];
  current: number;
  total: number;
  label: string;
}

export interface BookingMonthView {
  key: string;
  label: string;
  weekStartsOn: 0 | 1;
  /** The day keys of the visible grid, week-padded. */
  grid: string[];
  weekdayHeaders: string[];
  weekdayLongNames: string[];
  /** Availability of the visible month. */
  status: LoadStatus;
  error: string | null;
  loading: boolean;
}

export interface BookingDayView {
  date: string;
  bookable: boolean;
  isToday: boolean;
  isOutside: boolean;
  isSelected: boolean;
  count?: number;
  /** Accessible name: the full date plus availability. */
  label: string;
}

export interface BookingSlotView {
  id: string;
  start: string;
  end?: string;
  data?: unknown;
  /** Formatted time in the accepted zone and format. */
  label: string;
  selected: boolean;
  /** `UTC+02:00` when the local time repeats; otherwise absent. */
  utcOffsetLabel?: string;
}

export interface BookingSelectionView {
  status: SelectionStatus;
  /** The offer may still be booked: it was confirmed against availability. */
  usable: boolean;
  /** The offer is known to be gone and has to be cleared or replaced. */
  invalid: boolean;
  /** The offer is being re-checked and must not be booked yet. */
  verifying: boolean;
  reason: SelectionChangeReason | null;
  date: string | null;
  slot: BookingSlotView | null;
}

export interface BookingDurationView {
  current: number;
  options: number[];
  label: string;
  showSelector: boolean;
}

export interface BookingTimeView {
  /** Formatted start of the selected offer. */
  label: string;
  /** Full date of the selected day. */
  dateLabel: string;
  zoneHint: string;
}

export interface BookingSlotsView {
  status: LoadStatus;
  error: string | null;
  items: BookingSlotView[];
  count: number;
  /** `{count} slots`, or `null` while the count is unknown. */
  countLabel: string | null;
  label: string;
  loading: boolean;
  empty: boolean;
}

export interface BookingFormValueView {
  name: string;
  label: string;
  value: string;
  checked?: boolean;
}

export interface BookingFormView {
  fields: ResolvedBookingField[];
  values: BookingValues;
  /** Errors from the field rules and `validateValues`, before merging. */
  validationErrors: Record<string, string>;
  /** Errors the server reported, keyed by field name. */
  serverErrors: Record<string, string>;
  /** Merged errors: the server's message wins for a field it names. */
  errors: Record<string, string>;
  /** What the user may see right now. */
  visibleErrors: Record<string, string>;
  touched: Record<string, boolean>;
  /** An error that belongs to no known field, or to the form as a whole. */
  formError: string | null;
  /** The message of a creation that the adapter refused. */
  submitError: string | null;
  /** Heading for the error area, when anything is visible. */
  errorSummary: string | null;
  valid: boolean;
  submitLabel: string;
  submitting: boolean;
}

export interface BookingAttemptView {
  status: 'pending' | 'unknown';
  title: string;
  description: string;
  instructions: string | null;
  summaryLabel: string;
  summary: {
    dateLabel: string;
    timeLabel: string;
    durationLabel: string;
    values: BookingFormValueView[];
  };
  retryAllowed: boolean;
  retryLabel: string;
  retryDescription: string;
  canCheckStatus: boolean;
  checkStatusLabel: string;
}

export interface BookingConfirmationView {
  id: string;
  status: string;
  title: string;
  summary: string;
  invitation: string | null;
  location: string | null;
  instructions: string | null;
  joinUrl: string | null;
  calendarUrl: string | null;
  rescheduleUrl: string | null;
  cancelUrl: string | null;
  bookAnotherLabel: string;
}

export interface BookingActionsView {
  canGoBack: boolean;
  canSubmit: boolean;
  canPickAnotherDay: boolean;
  canRetry: boolean;
  canCheckStatus: boolean;
  /** Whether the standard widget offers "Book another". */
  canReset: boolean;
}

export interface BookingView {
  step: SlotlineStep;
  direction: 1 | -1;
  title: string;
  settings: BookingSettingsView;
  progress: BookingProgressView;
  month: BookingMonthView;
  days: Record<string, BookingDayView>;
  selection: BookingSelectionView;
  duration: BookingDurationView;
  time: BookingTimeView;
  slots: BookingSlotsView;
  form: BookingFormView;
  attempt: BookingAttemptView | null;
  confirmation: BookingConfirmationView | null;
  actions: BookingActionsView;
  /** The polite live-region announcement for the current step. */
  live: { message: string };
}

/* -------------------------------------------------------------------------- */

/** Free offers of a day: the explicit count when given, else the inline list. */
export function countSlots(day: DayAvailability | undefined): number | undefined {
  if (!day) return undefined;
  if (typeof day.slotCount === 'number') return day.slotCount;
  return day.slots?.length;
}

/** The steps a user walks through. */
export const FLOW_STEP_ORDER: readonly SlotlineStep[] = ['date', 'time', 'details', 'confirmed'];

/** The steps of this configuration. */
export function userSteps(config: BookingConfig): SlotlineStep[] {
  void config;
  return [...FLOW_STEP_ORDER];
}

function progressOf(state: BookingState, config: BookingConfig): BookingProgressView {
  const steps = userSteps(config);
  const index = steps.indexOf(state.step);
  // The attempt screen is a service screen: it keeps the position of the step the
  // operation was started from rather than becoming a step of its own.
  const position = index >= 0 ? index : Math.max(0, steps.indexOf('details'));
  const current = position + 1;
  return {
    steps,
    current,
    total: steps.length,
    label: format(config.messages.progressLabel, { step: current, total: steps.length }),
  };
}

/**
 * A day is bookable when the adapter knows about it, it sits inside the allowed
 * range, and it has at least one free slot. A day the adapter did not mention is
 * not bookable; a day it mentioned without a count is (the count is optional).
 */
function isBookableDate(
  date: string,
  earliest: string,
  maxDate: string | undefined,
  count: number | undefined,
  known: boolean,
): boolean {
  if (!known) return false;
  if (compareDayKeys(date, earliest) < 0) return false;
  if (maxDate && compareDayKeys(date, maxDate) > 0) return false;
  return count === undefined ? true : count > 0;
}

function dayLabelOf(date: string, count: number | undefined, config: BookingConfig): string {
  const availability =
    count !== undefined && count > 0
      ? format(config.messages.slotsCount, { count })
      : config.messages.dayUnavailable;
  return [formatFullDay(date, config.locale), availability].join(', ');
}

function slotViewOf(
  slot: { id: string; start: string; end?: string; data?: unknown },
  config: BookingConfig,
  selected: boolean,
): BookingSlotView {
  return {
    id: slot.id,
    start: slot.start,
    ...(slot.end === undefined ? {} : { end: slot.end }),
    ...(slot.data === undefined ? {} : { data: slot.data }),
    label: formatTime(slot.start, config.timeZone, config.locale, config.timeFormat),
    selected,
    ...(isRepeatedLocalTime(slot.start, config.timeZone)
      ? {
          utcOffsetLabel: format(config.messages.slotUtcOffsetDescription, {
            offset: formatUtcOffset(slot.start, config.timeZone),
          }),
        }
      : {}),
  };
}

function displayValue(value: unknown): BookingFormValueView['value'] {
  if (value === undefined || value === null || typeof value === 'boolean') return '';
  return String(value);
}

function valueEntries(values: BookingValues, config: BookingConfig): BookingFormValueView[] {
  return config.fields.map((field) => {
    const value = values[field.name];
    return {
      name: field.name,
      label: field.label,
      value: displayValue(value),
      ...(typeof value === 'boolean' ? { checked: value } : {}),
    };
  });
}

function invitationTextOf(result: BookingResult, config: BookingConfig): string | null {
  const invitation = result.invitation;
  if (!invitation || !invitation.email) return null;
  const template =
    invitation.status === 'sent'
      ? config.messages.invitationSentDescription
      : invitation.status === 'pending'
        ? config.messages.invitationPendingDescription
        : config.messages.invitationFailedDescription;
  return format(template, { email: invitation.email });
}

/** The zone name at the meeting itself, not at the moment of rendering. */
function zoneNameOf(state: BookingState, config: BookingConfig, anchor: BookingTimeAnchor) {
  const at = state.selectedSlot ? new Date(state.selectedSlot.start) : new Date(anchor.nowMs);
  return formatTimeZoneName(config.timeZone, config.locale, at);
}

export function deriveBookingView(
  state: BookingState,
  config: BookingConfig,
  anchor: BookingTimeAnchor,
): BookingView {
  const { messages } = config;
  const grid = buildMonthGrid(state.month, config.weekStartsOn);
  const earliest = config.minDate ?? anchor.today;

  /* -- days ---------------------------------------------------------------- */

  const days: Record<string, BookingDayView> = {};
  for (const date of grid) {
    const availability = state.days[date];
    const count = countSlots(availability);
    days[date] = {
      date,
      bookable: isBookableDate(date, earliest, config.maxDate, count, availability !== undefined),
      isToday: date === anchor.today,
      isOutside: monthKeyOf(date) !== state.month,
      isSelected: state.selectedDate === date,
      ...(count === undefined ? {} : { count }),
      label: dayLabelOf(date, count, config),
    };
  }

  /* -- offers and the selection -------------------------------------------- */

  const slotItems = state.slots.map((slot) =>
    slotViewOf(slot, config, state.selectedSlot?.id === slot.id),
  );
  const selectedSlotView = state.selectedSlot
    ? (slotItems.find((item) => item.id === state.selectedSlot?.id) ??
      slotViewOf(state.selectedSlot, config, true))
    : null;

  const selection: BookingSelectionView = {
    status: state.selectionStatus,
    usable: state.selectionStatus === 'valid',
    invalid: state.selectionStatus === 'invalid',
    verifying: state.selectionStatus === 'verifying',
    reason: state.selectionReason,
    date: state.selectedDate,
    slot: selectedSlotView,
  };

  /* -- labels -------------------------------------------------------------- */

  const dateLabel = state.selectedDate ? formatFullDay(state.selectedDate, config.locale) : '';
  const timeLabel = state.selectedSlot
    ? formatTime(state.selectedSlot.start, config.timeZone, config.locale, config.timeFormat)
    : '';
  const durationLabel = format(messages.duration, { count: state.duration });
  const timeZoneName = zoneNameOf(state, config, anchor);

  /* -- form ---------------------------------------------------------------- */

  const validationErrors = validateBookingValues(
    state.values,
    config.fields,
    messages,
    config.validateValues,
  );
  const errors = { ...validationErrors, ...state.fieldErrors };
  const visibleErrors = visibleFieldErrors(errors, state.fieldErrors, state.touched);
  const submitting = state.submitStatus === 'submitting';

  const form: BookingFormView = {
    fields: config.fields,
    values: state.values,
    validationErrors,
    serverErrors: state.fieldErrors,
    errors,
    visibleErrors,
    touched: state.touched,
    formError: state.formError,
    submitError: state.submitError,
    errorSummary: Object.keys(visibleErrors).length > 0 ? messages.formErrorsSummaryTitle : null,
    valid: Object.keys(validationErrors).length === 0,
    submitLabel: submitting ? messages.confirming : messages.confirm,
    submitting,
  };

  /* -- attempt ------------------------------------------------------------- */

  let attempt: BookingAttemptView | null = null;
  if (state.attempt) {
    const request = state.attempt.request;
    const unknown = state.attempt.status === 'unknown';
    const idempotent = config.capabilities?.idempotentCreate === true;
    // The window is measured against the injected anchor, never against the wall
    // clock, and by the same helpers the reducer tests cover.
    const retryAllowed =
      unknown && isRetrySafe(state.attempt.startedAt, config.capabilities, anchor.nowMs);
    const windowExists =
      retryWindowClosesAt(state.attempt.startedAt, config.capabilities) !== undefined;

    attempt = {
      status: state.attempt.status,
      title: unknown ? messages.attemptUnknownTitle : messages.attemptPendingTitle,
      description: unknown
        ? messages.attemptUnknownDescription
        : messages.attemptPendingDescription,
      instructions: unknown ? messages.attemptUnknownInstructions : null,
      summaryLabel: messages.attemptSummaryLabel,
      summary: {
        dateLabel: formatFullDay(
          dayKeyOfInstant(request.slot.start, config.timeZone),
          config.locale,
        ),
        timeLabel: formatTime(
          request.slot.start,
          config.timeZone,
          config.locale,
          config.timeFormat,
        ),
        durationLabel: format(messages.duration, { count: request.duration }),
        values: valueEntries(request.values, config),
      },
      retryAllowed,
      retryLabel: messages.retryBookingLabel,
      retryDescription: !unknown
        ? messages.attemptPendingDescription
        : retryAllowed
          ? messages.retryBookingDescription
          : windowExists
            ? messages.retryWindowExpiredDescription
            : messages.retryUnavailableDescription,
      canCheckStatus: unknown,
      checkStatusLabel: messages.checkBookingStatusLabel,
    };
  }

  /* -- confirmation -------------------------------------------------------- */

  const result = state.result;
  const confirmation: BookingConfirmationView | null = result
    ? {
        id: result.id,
        status: result.status,
        title: messages.bookedTitle,
        summary: format(messages.bookedSummary, {
          date: dateLabel,
          time: timeLabel,
          duration: durationLabel,
        }),
        invitation: invitationTextOf(result, config),
        location: result.location ?? null,
        instructions: result.instructions ?? null,
        joinUrl: result.joinUrl ?? null,
        calendarUrl: result.calendarUrl ?? null,
        rescheduleUrl: result.rescheduleUrl ?? null,
        cancelUrl: result.cancelUrl ?? null,
        bookAnotherLabel: messages.bookAnother,
      }
    : null;

  /* -- what the user may do ------------------------------------------------ */

  const slotsReady = state.slotsStatus === 'ready';
  const actions: BookingActionsView = {
    // Nothing sits above the calendar; the confirmation is terminal and the
    // attempt screen is terminal until the attempt is settled.
    canGoBack: state.step !== 'date' && state.step !== 'confirmed' && state.step !== 'attempt',
    canSubmit:
      selection.usable &&
      form.valid &&
      !submitting &&
      state.attempt === null &&
      // The confirmation is terminal: a new booking starts with "Book another".
      state.step !== 'confirmed',
    canPickAnotherDay: slotsReady && state.slots.length === 0,
    canRetry: attempt?.retryAllowed === true,
    canCheckStatus: attempt?.canCheckStatus === true,
    // "Book another" only appears after a known, successful result.
    canReset: state.step === 'confirmed' && state.submitStatus === 'success',
  };

  /* -- announcement -------------------------------------------------------- */

  const progress = progressOf(state, config);
  const live = {
    message:
      state.step === 'confirmed' && confirmation
        ? `${messages.bookedTitle}. ${confirmation.summary}`
        : state.step === 'attempt' && attempt
          ? `${attempt.title}. ${attempt.description}`
          : progress.label,
  };

  return {
    step: state.step,
    direction: state.direction,
    title: state.step === 'confirmed' ? messages.bookedHeader : (config.title ?? messages.title),
    settings: {
      locale: config.locale,
      timeZone: config.timeZone,
      ...(timeZoneName === undefined ? {} : { timeZoneName }),
      timeFormat: config.timeFormat,
      contextKey: config.context.key,
    },
    progress,
    month: {
      key: state.month,
      label: formatMonthYear(state.month, config.locale),
      weekStartsOn: config.weekStartsOn,
      grid,
      weekdayHeaders: rotateToWeekStart(
        shortWeekdayNames(config.locale, messages.weekdays),
        config.weekStartsOn,
      ),
      weekdayLongNames: rotateToWeekStart(weekdayNames(config.locale), config.weekStartsOn),
      status: state.daysStatus,
      error: state.daysError,
      loading: state.daysStatus === 'loading' || state.daysStatus === 'idle',
    },
    days,
    selection,
    duration: {
      current: state.duration,
      options: [...config.durationOptions],
      label: durationLabel,
      showSelector: config.showDurationSelector && config.durationOptions.length > 1,
    },
    time: {
      label: timeLabel,
      dateLabel,
      zoneHint: format(messages.timeZoneHint, {
        zone: timeZoneName ?? config.timeZone,
        timeZone: config.timeZone,
      }),
    },
    slots: {
      status: state.slotsStatus,
      error: state.slotsError,
      items: slotItems,
      count: state.slots.length,
      countLabel: slotsReady ? format(messages.slotsCount, { count: state.slots.length }) : null,
      label: messages.slotsLabel,
      loading: state.slotsStatus === 'loading' || state.slotsStatus === 'idle',
      empty: slotsReady && state.slots.length === 0,
    },
    form,
    attempt,
    confirmation,
    actions,
    live,
  };
}
