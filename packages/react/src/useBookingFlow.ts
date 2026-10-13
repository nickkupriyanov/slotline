/**
 * The headless core of Slotline: state machine + data loading + validation.
 * `Slotline` is a thin view over this hook, and you can build your own UI on it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  addMonths,
  buildMonthGrid,
  clampDayKey,
  compareDayKeys,
  countSlots,
  createFlowState,
  dayKeyOf,
  detectLocale,
  endOf,
  firstDayOfMonth,
  flowReducer,
  format,
  formatFullDay,
  formatMonthYear,
  formatTime,
  formatTimeZoneName,
  hasErrors,
  lastDayOfMonth,
  monthKeyOf,
  normalizeDateInput,
  resolveMessages,
  resolveTimeZone,
  rotateToWeekStart,
  shortWeekdayNames,
  todayKey,
  validateDetails,
  visibleErrors,
  weekdayNames,
  type FieldErrors,
  type FlowState,
} from '@nickkupriyanov/slotline-core';
import { useControllableState } from './hooks/useControllableState';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import type {
  SlotlineMessages,
  SlotlineProps,
  SlotlineStep,
  SlotlineTheme,
  BookingAdapter,
  BookingRequest,
  BookingResult,
  DayAvailability,
  TimeSlot,
} from './types';

export interface UseBookingFlowResult {
  state: FlowState;
  /** Merged copy for the active locale. */
  messages: SlotlineMessages;
  /** Locale used for `Intl` formatting. */
  locale: string;
  timeZone: string;
  /** Short zone hint, e.g. `GMT+2`. */
  timeZoneName?: string;
  theme: Exclude<SlotlineTheme, 'system'>;
  /** Header title for the current step. */
  title: string;
  durations: number[];
  weekStartsOn: 0 | 1;
  minDate?: string;
  maxDate?: string;
  /** The 42 day keys of the visible month view. */
  monthGrid: string[];
  /** Short weekday headers, rotated to `weekStartsOn`. */
  weekdayHeaders: string[];
  /** Long weekday names for accessible headers, rotated to `weekStartsOn`. */
  weekdayLongNames: string[];
  monthLabel: string;
  selectedDateLabel: string;
  selectedTimeLabel: string;
  durationLabel: string;
  /** Availability for one day, if the adapter knows about it. */
  availabilityOf: (dayKey: string) => DayAvailability | undefined;
  isDayBookable: (dayKey: string) => boolean;
  canGoBack: boolean;
  fieldErrors: FieldErrors;
  shownFieldErrors: FieldErrors;
  /** `true` when the details form can be submitted. */
  detailsValid: boolean;
  actions: {
    selectDate: (dayKey: string) => void;
    selectSlot: (slot: TimeSlot) => void;
    setDuration: (minutes: number) => void;
    setDetails: (details: Partial<{ name: string; email: string; notes: string }>) => void;
    /** Marks a field as touched so its validation message becomes visible. */
    touchField: (field: 'name' | 'email') => void;
    back: () => void;
    submit: () => Promise<void>;
    reset: () => void;
    goToMonth: (monthKey: string) => void;
    previousMonth: () => void;
    nextMonth: () => void;
    reloadAvailability: () => void;
    reloadSlots: () => void;
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function messageOf(value: unknown, fallback: string): string {
  const error = toError(value);
  return error.message && error.message !== 'undefined' ? error.message : fallback;
}

export function useBookingFlow(props: SlotlineProps): UseBookingFlowResult {
  const {
    adapter,
    durations = [15, 30, 60],
    duration: durationProp,
    defaultDuration,
    onDurationChange,
    timeZone: timeZoneProp,
    locale: localeProp,
    messages: messagesProp,
    theme = 'dark',
    minDate: minDateProp,
    maxDate: maxDateProp,
    weekStartsOn = 0,
    onBooked,
    onError,
    onDismiss,
  } = props;

  const locale = localeProp ?? detectLocale();
  const timeZone = timeZoneProp ?? resolveTimeZone();
  const resolvedTheme = useResolvedTheme(theme);
  const messages = useMemo(() => resolveMessages(locale, messagesProp), [locale, messagesProp]);

  const durationOptions = useMemo(
    () => (durations.length > 0 ? durations : [15, 30, 60]),
    [durations],
  );
  const [duration, setDurationValue] = useControllableState<number>({
    value: durationProp,
    defaultValue: defaultDuration ?? durationOptions[0] ?? 15,
    onChange: onDurationChange,
  });

  const minDate = useMemo(() => normalizeDateInput(minDateProp, timeZone), [minDateProp, timeZone]);
  const maxDate = useMemo(() => normalizeDateInput(maxDateProp, timeZone), [maxDateProp, timeZone]);

  const today = todayKey(timeZone);
  const earliestDate = minDate ?? today;
  const initialMonth = monthKeyOf(clampDayKey(earliestDate, minDate, maxDate));

  const [state, dispatch] = useReducer(flowReducer, undefined, () =>
    createFlowState({ duration, month: initialMonth }),
  );

  /* ---------------------------------------------------------------- refs -- */

  const adapterRef = useRef<BookingAdapter>(adapter);
  adapterRef.current = adapter;
  const stateRef = useRef(state);
  stateRef.current = state;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onBookedRef = useRef(onBooked);
  onBookedRef.current = onBooked;

  /** Keeps two public `actions.submit()` calls from overlapping. */
  const submitLockRef = useRef(false);
  const daysTokenRef = useRef(0);
  const slotsTokenRef = useRef(0);
  const [availabilityNonce, setAvailabilityNonce] = useReducer((n: number) => n + 1, 0);
  const [slotsNonce, setSlotsNonce] = useReducer((n: number) => n + 1, 0);

  /* --------------------------------------------------- keep duration sync -- */

  useEffect(() => {
    dispatch({ type: 'setDuration', duration });
  }, [duration]);

  /* ------------------------------------------------------- availability -- */

  useEffect(() => {
    const controller = new AbortController();
    const token = (daysTokenRef.current += 1);
    const from = firstDayOfMonth(state.month);
    const to = lastDayOfMonth(state.month);

    dispatch({ type: 'daysLoading', token });
    void (async () => {
      try {
        const days = await adapterRef.current.getAvailability({
          from,
          to,
          duration,
          timeZone,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        dispatch({ type: 'daysLoaded', token, days: Array.isArray(days) ? days : [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'daysFailed',
          token,
          error: messageOf(error, messagesRef.current.genericError),
        });
        onErrorRef.current?.(toError(error));
      }
    })();

    return () => controller.abort();
  }, [state.month, duration, timeZone, availabilityNonce]);

  /* -------------------------------------------------------------- slots -- */

  const daysRef = useRef(state.days);
  daysRef.current = state.days;

  useEffect(() => {
    const date = state.selectedDate;
    if (!date) return;

    const token = (slotsTokenRef.current += 1);
    // Register the token with the reducer *before* a response can arrive:
    // `slotsLoaded` / `slotsFailed` are dropped unless they carry the newest one.
    dispatch({ type: 'slotsLoading', token });

    const inline = daysRef.current[date]?.slots;
    if (inline && inline.length > 0) {
      dispatch({ type: 'slotsLoaded', token, slots: inline });
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const slots = await adapterRef.current.getSlots({
          date,
          duration,
          timeZone,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        dispatch({ type: 'slotsLoaded', token, slots: Array.isArray(slots) ? slots : [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'slotsFailed',
          token,
          error: messageOf(error, messagesRef.current.genericError),
        });
        onErrorRef.current?.(toError(error));
      }
    })();

    return () => controller.abort();
  }, [state.selectedDate, state.selectionNonce, duration, timeZone, slotsNonce]);

  /* ------------------------------------------------------------- actions -- */

  const selectDate = useCallback((dayKey: string) => {
    dispatch({ type: 'selectDate', date: dayKey });
  }, []);

  const selectSlot = useCallback((slot: TimeSlot) => {
    dispatch({ type: 'selectSlot', slot });
  }, []);

  const setDuration = useCallback(
    (minutes: number) => {
      setDurationValue(minutes);
    },
    [setDurationValue],
  );

  const setDetails = useCallback(
    (details: Partial<{ name: string; email: string; notes: string }>) => {
      dispatch({ type: 'setDetails', details });
    },
    [],
  );

  const goToMonth = useCallback((monthKey: string) => {
    dispatch({ type: 'setMonth', month: monthKey });
  }, []);

  const touchField = useCallback((field: 'name' | 'email') => {
    dispatch({ type: 'touch', field });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const back = useCallback(() => {
    const current = stateRef.current;
    // Never navigate away from an in-flight booking: the response would land on
    // a different step than the one the user is looking at.
    if (current.submitStatus === 'submitting') return;
    // Nothing sits above the calendar, and the confirmation is terminal —
    // both are the consumer's cue to close the widget.
    if (current.step === 'date' || current.step === 'confirmed') {
      onDismiss?.();
      return;
    }
    dispatch({ type: 'back' });
  }, [onDismiss]);

  const reloadAvailability = useCallback(() => {
    setAvailabilityNonce();
  }, []);

  const reloadSlots = useCallback(() => {
    setSlotsNonce();
  }, []);

  const submit = useCallback(async () => {
    // `actions.submit()` is public, so the disabled button alone cannot keep
    // two requests from overlapping — the lock is set before the first await.
    if (submitLockRef.current) return;

    const snapshot = stateRef.current;
    const currentMessages = messagesRef.current;
    dispatch({ type: 'touch', field: 'name' });
    dispatch({ type: 'touch', field: 'email' });

    const errors = validateDetails(snapshot.details, currentMessages);
    if (hasErrors(errors) || !snapshot.selectedSlot || !snapshot.selectedDate) return;

    const request: BookingRequest = {
      slot: { ...snapshot.selectedSlot, end: endOf(snapshot.selectedSlot, snapshot.duration) },
      date: snapshot.selectedDate,
      duration: snapshot.duration,
      timeZone,
      details: {
        name: snapshot.details.name.trim(),
        email: snapshot.details.email.trim(),
        ...(snapshot.details.notes ? { notes: snapshot.details.notes } : {}),
      },
    };

    /** The response may only drive the UI while this is still the same scenario. */
    const scenario = snapshot.scenarioId;
    const stillCurrent = () => {
      const current = stateRef.current;
      return (
        // `scenarioId` also covers "reset, then book the very same slot again":
        // the date and the slot can match a second time, the scenario cannot.
        current.scenarioId === scenario &&
        current.selectedDate === request.date &&
        current.selectedSlot?.start === request.slot.start
      );
    };

    submitLockRef.current = true;
    dispatch({ type: 'submitStart' });
    try {
      const result: BookingResult = await adapterRef.current.createBooking(request);
      // The booking exists, so the consumer always hears about it.
      onBookedRef.current?.(result ?? {}, request);
      if (stillCurrent()) dispatch({ type: 'submitSucceeded', scenario, result: result ?? {} });
    } catch (error) {
      onErrorRef.current?.(toError(error));
      if (stillCurrent()) {
        dispatch({
          type: 'submitFailed',
          scenario,
          error: messageOf(error, currentMessages.genericError),
        });
      }
    } finally {
      submitLockRef.current = false;
    }
  }, [timeZone]);

  /* ----------------------------------------------------------- selectors -- */

  const monthGrid = useMemo(
    () => buildMonthGrid(state.month, weekStartsOn),
    [state.month, weekStartsOn],
  );

  const weekdayHeaders = useMemo(
    () => rotateToWeekStart(shortWeekdayNames(locale, messages.weekdays), weekStartsOn),
    [locale, messages.weekdays, weekStartsOn],
  );

  const weekdayLong = useMemo(
    () => rotateToWeekStart(weekdayNames(locale), weekStartsOn),
    [locale, weekStartsOn],
  );

  const fieldErrors = useMemo(
    () => validateDetails(state.details, messages),
    [state.details, messages],
  );

  const availabilityOf = useCallback((dayKey: string) => state.days[dayKey], [state.days]);

  const isDayBookable = useCallback(
    (dayKey: string) => {
      if (compareDayKeys(dayKey, earliestDate) < 0) return false;
      if (maxDate && compareDayKeys(dayKey, maxDate) > 0) return false;
      const availability = state.days[dayKey];
      if (!availability) return false;
      const count = countSlots(availability);
      return count === undefined ? true : count > 0;
    },
    [state.days, earliestDate, maxDate],
  );

  const selectedDateLabel = state.selectedDate ? formatFullDay(state.selectedDate, locale) : '';
  const selectedTimeLabel = state.selectedSlot
    ? formatTime(state.selectedSlot.start, timeZone, locale)
    : '';

  return {
    state,
    messages,
    locale,
    timeZone,
    timeZoneName: state.step === 'date' ? formatTimeZoneName(timeZone, locale) : undefined,
    theme: resolvedTheme,
    title: state.step === 'confirmed' ? messages.bookedHeader : (props.title ?? messages.title),
    durations: durationOptions,
    weekStartsOn,
    ...(minDate ? { minDate } : {}),
    ...(maxDate ? { maxDate } : {}),
    monthGrid,
    weekdayHeaders,
    weekdayLongNames: weekdayLong,
    monthLabel: formatMonthYear(state.month, locale),
    selectedDateLabel,
    selectedTimeLabel,
    durationLabel: format(messages.duration, { count: duration }),
    availabilityOf,
    isDayBookable,
    // The confirmation is terminal: there is nothing to go back to, so the back
    // affordance only appears there when the consumer supplied `onDismiss`.
    canGoBack: (state.step !== 'date' && state.step !== 'confirmed') || Boolean(onDismiss),
    fieldErrors,
    shownFieldErrors: visibleErrors(fieldErrors, state.touched),
    detailsValid: !hasErrors(fieldErrors),
    actions: {
      selectDate,
      selectSlot,
      setDuration,
      setDetails,
      touchField,
      back,
      submit,
      reset,
      goToMonth,
      previousMonth: () => goToMonth(addMonths(stateRef.current.month, -1)),
      nextMonth: () => goToMonth(addMonths(stateRef.current.month, 1)),
      reloadAvailability,
      reloadSlots,
    },
  };
}

/** Convenience re-export for consumers that only need the day key of a date. */
export { dayKeyOf };

export type { SlotlineStep };
