/**
 * The booking controller.
 *
 * Framework-free and free of I/O policy: it owns the reducer state, the resolved
 * configuration, the time reference and the requests, and it exposes all of that
 * as one immutable snapshot for a binding to render.
 *
 * Three rules shape it:
 *
 * - **Nothing happens at creation.** No request, no timer, no callback. A binding
 *   calls `start()` when it is live and `stop()` when it goes away; both are
 *   idempotent, so a Strict Mode double mount is harmless.
 * - **Controlled or not is fixed at creation.** A value the application supplies
 *   is a proposal: the controller announces it and waits for the application to
 *   send it back. A value the controller owns is applied immediately and still
 *   announced.
 * - **Time is injected.** The controller schedules the next meaningful boundary
 *   through the clock it was given and never reads `Date.now()` itself.
 */
import {
  DEFAULT_TIME_FORMAT,
  FALLBACK_TIME_ZONE,
  resolveBookingConfig,
  type BookingConfig,
  type BookingConfigInput,
} from './config';
import {
  addMonths,
  clampDayKey,
  dayKeyOfInstant,
  endOf,
  firstDayOfMonth,
  formatUtcOffset,
  isDayKey,
  lastDayOfMonth,
  monthKeyOf,
  todayKey,
} from './date';
import { deriveBookingView, type BookingView } from './derive';
import { BookingError, guaranteesNotCreated, isAbortError, toBookingError } from './errors';
import { createEmptyValues, unmappedFieldNames, validateBookingValues } from './fields';
import { format } from './i18n';
import { createIdempotencyKey } from './ids';
import {
  bookingReducer,
  createBookingState,
  type BookingAction,
  type BookingAttemptState,
  type BookingState,
} from './reducer';
import {
  createTimeAnchor,
  isRetrySafe,
  midnightAfter,
  retryWindowClosesAt,
  soonestBoundary,
  systemClock,
  timeAnchorKey,
} from './time';
import type {
  AvailabilityAdapter,
  BookingAdapter,
  BookingAttemptOutcome,
  BookingChangeMetadata,
  BookingClock,
  BookingContext,
  BookingRequest,
  BookingResult,
  BookingSelection,
  BookingTimeAnchor,
  BookingValues,
  DayAvailability,
  DefaultBookingValues,
  InitialBookingAttempt,
  SelectionChangeReason,
  TimeFormat,
  TimeSlot,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Public shape                                                               */
/* -------------------------------------------------------------------------- */

export interface BookingSnapshot {
  /** Bumped whenever the value below changes; stable while nothing does. */
  revision: number;
  state: BookingState;
  view: BookingView;
}

export interface BookingErrorContext {
  phase: 'availability' | 'slots' | 'booking';
  outcome: 'not_created' | 'unknown' | 'not_applicable';
  request?: Readonly<BookingRequest<BookingValues>>;
}

export interface BookingControllerHandlers {
  onSelectionChange?(selection: BookingSelection, metadata: BookingChangeMetadata): void;
  onValuesChange?(values: BookingValues, metadata: BookingChangeMetadata): void;
  onDurationChange?(duration: number, metadata: BookingChangeMetadata): void;
  onTimeZoneChange?(timeZone: string, metadata: BookingChangeMetadata): void;
  onTimeFormatChange?(timeFormat: TimeFormat, metadata: BookingChangeMetadata): void;
  onContextChange?(context: BookingContext, metadata: BookingChangeMetadata): void;
  /**
   * Called once for every booking that exists. An exception thrown here is
   * ignored on purpose: the record is real, and the flow must not present it as a
   * failure or offer a repeat.
   */
  onBooked?(result: BookingResult, request: BookingRequest<BookingValues>): void;
  onError?(error: BookingError, context: BookingErrorContext): void;
  /** Called by `back()` on the calendar and on the confirmation. */
  onDismiss?(): void;
}

/**
 * Values the application may own. Whether each one is controlled is fixed when the
 * controller is created.
 *
 * `TValues` defaults to the built-in form payload and is inferred from the
 * adapter, so a custom form keeps its own type without extra annotations.
 */
export interface BookingControllerInputs<TValues = DefaultBookingValues> {
  values?: TValues;
  defaultValues?: TValues;
  duration?: number;
  defaultDuration?: number;
  timeZone?: string;
  defaultTimeZone?: string;
  timeFormat?: TimeFormat;
  defaultTimeFormat?: TimeFormat;
}

/** Everything except the values above, which travel through `inputs`. */
export type BookingConfigOverrides = Omit<BookingConfigInput, 'timeZone' | 'timeFormat'>;

interface BookingControllerBase<TValues> {
  config?: BookingConfigOverrides;
  inputs?: BookingControllerInputs<TValues>;
  clock?: BookingClock;
  /** The instant server rendering used; the client starts from it until it mounts. */
  initialTime?: number;
  initialAttempt?: InitialBookingAttempt | null;
  handlers?: BookingControllerHandlers;
}

export type BookingControllerOptions<TValues = DefaultBookingValues> =
  BookingControllerBase<TValues> & { adapter: BookingAdapter<TValues> };

export interface BookingControllerActions {
  /** Picks a day. In controlled mode this proposes `{ date, slot: null }`. */
  selectDate(date: string): void;
  /** Picks an offer. In controlled mode this proposes `{ date, slot }`. */
  selectSlot(slot: TimeSlot): void;
  setDuration(minutes: number): void;
  /** Merges a patch into the form values. */
  setValues(values: BookingValues): void;
  touchField(field: string): void;
  setTimeZone(timeZone: string): void;
  setTimeFormat(timeFormat: TimeFormat): void;
  setContext(context: BookingContext): void;
  clearSelection(reason?: SelectionChangeReason): void;
  goToMonth(month: string): void;
  previousMonth(): void;
  nextMonth(): void;
  back(): void;
  /** Validates, freezes a request and sends it. Never runs twice concurrently. */
  submit(): Promise<void>;
  /** Repeats an unresolved attempt when the adapter's window is still open. */
  retry(): void;
  /**
   * Applies what the application learned about an unresolved attempt. Answers
   * `false` — and changes nothing — for a key that is not the pending one.
   */
  resolveAttempt(resolution: {
    idempotencyKey: string;
    outcome: BookingAttemptOutcome;
    message?: string;
  }): boolean;
  reset(): void;
  reloadAvailability(): void;
  reloadSlots(): void;
}

export interface BookingController<TValues = DefaultBookingValues> {
  getSnapshot(): BookingSnapshot;
  /** The time reference, for an application that serialises it during SSR. */
  getTimeAnchor(): BookingTimeAnchor;
  subscribe(listener: () => void): () => void;
  /**
   * Replaces the adapter. A binding cannot promise a stable object, and a new
   * adapter may declare different capabilities, so the configuration is resolved
   * again.
   *
   */
  updateAdapter(adapter: AvailabilityAdapter<TValues> | BookingAdapter<TValues>): void;
  /** Configuration that is not a controlled value. */
  updateConfig(config: BookingConfigOverrides): void;
  /** Controlled and initial values. */
  updateInputs(inputs: BookingControllerInputs<TValues>): void;
  readonly actions: BookingControllerActions;
  start(): void;
  stop(): void;
  /** Re-reads the clock; a binding calls this when the tab becomes visible again. */
  refreshTime(): void;
}

/* -------------------------------------------------------------------------- */
/*  Implementation                                                             */
/* -------------------------------------------------------------------------- */

function isProduction(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.NODE_ENV === 'production';
}

function contractViolation(message: string): BookingError {
  return new BookingError({ code: 'ADAPTER_CONTRACT_VIOLATION', message });
}

/** Offers must carry a unique id and a real instant; anything else is a bug. */
function requireSlots(value: unknown): TimeSlot[] {
  if (!Array.isArray(value))
    throw contractViolation('The adapter did not return a list of offers.');

  const seen = new Set<string>();
  const slots: TimeSlot[] = [];
  for (const candidate of value) {
    const slot = candidate as Partial<TimeSlot> | null;
    if (!slot || typeof slot.id !== 'string' || slot.id.length === 0) {
      throw contractViolation('An offer is missing its id.');
    }
    if (typeof slot.start !== 'string' || Number.isNaN(Date.parse(slot.start))) {
      throw contractViolation(`Offer "${slot.id}" has no valid start.`);
    }
    if (seen.has(slot.id)) throw contractViolation(`Offer id "${slot.id}" is used twice.`);
    seen.add(slot.id);
    slots.push(slot as TimeSlot);
  }
  return slots;
}

function requireDays(value: unknown): DayAvailability[] {
  if (!Array.isArray(value)) throw contractViolation('The adapter did not return a list of days.');

  const seen = new Set<string>();
  const days: DayAvailability[] = [];
  for (const candidate of value) {
    const day = candidate as Partial<DayAvailability> | null;
    if (!day || typeof day.date !== 'string' || !isDayKey(day.date)) {
      throw contractViolation('A published day has no valid date.');
    }
    if (seen.has(day.date)) throw contractViolation(`Day "${day.date}" is published twice.`);
    if (day.slots !== undefined) requireSlots(day.slots);
    seen.add(day.date);
    days.push(day as DayAvailability);
  }
  return days;
}

/** A created booking has to be identifiable; a response without an id is a bug. */
function requireResult(value: unknown): BookingResult {
  const result = value as Partial<BookingResult> | null;
  if (!result || typeof result !== 'object') {
    throw contractViolation('The adapter did not return a booking.');
  }
  if (typeof result.id !== 'string' || result.id.length === 0) {
    throw contractViolation('The created booking has no id.');
  }
  if (result.status !== 'confirmed') {
    throw contractViolation('The created booking has an unexpected status.');
  }
  return result as BookingResult;
}

function messageOf(error: BookingError, fallback: string): string {
  return error.message && error.message !== 'undefined' ? error.message : fallback;
}

function sameSelection(a: BookingSelection, b: BookingSelection): boolean {
  if (a === null || b === null) return a === b;
  return a.date === b.date && (a.slot?.id ?? null) === (b.slot?.id ?? null);
}

function selectionOf(state: BookingState): BookingSelection {
  if (!state.selectedDate) return null;
  return { date: state.selectedDate, slot: state.selectedSlot };
}

/**
 * Structural comparison of two config inputs, so re-supplying equal values — which
 * a binding does on every render — never invalidates the snapshot. Objects deeper
 * than two levels (a context payload) are compared by identity: the application is
 * expected to keep those stable.
 */
function sameConfigValue(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (depth >= 3) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameConfigValue(item, b[index], depth + 1));
  }
  if (typeof a === 'function' || typeof b === 'function') return false;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (
      !sameConfigValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        depth + 1,
      )
    ) {
      return false;
    }
  }
  return true;
}

function sameInputs(a: object, b: object): boolean {
  return sameConfigValue(a, b);
}

export function createBookingController<TValues = DefaultBookingValues>(
  options: BookingControllerOptions<TValues>,
): BookingController<TValues> {
  let adapter = options.adapter as BookingAdapter<TValues>;
  const clock = options.clock ?? systemClock();
  const handlers = options.handlers ?? {};

  const givenInputs: BookingControllerInputs<TValues> = options.inputs ?? {};

  /* -- controlled or not: fixed now, for the life of this controller -------- */

  const controlled = {
    values: givenInputs.values !== undefined,
    duration: givenInputs.duration !== undefined,
    timeZone: givenInputs.timeZone !== undefined,
    timeFormat: givenInputs.timeFormat !== undefined,
  };
  const warned = new Set<string>();

  function warnOnce(property: string): void {
    if (isProduction() || warned.has(property)) return;
    warned.add(property);
    console.warn(
      `[slotline] "${property}" appeared after the controller was created. That choice is fixed ` +
        `at creation, so the value is ignored: pass the controlled value from the first render ` +
        `or use the matching "default*" input.`,
    );
  }

  /* -- configuration and the values the controller owns --------------------- */

  let configOverrides: BookingConfigOverrides = options.config ?? {};
  let timeZone: string = controlled.timeZone
    ? (givenInputs.timeZone as string)
    : (givenInputs.defaultTimeZone ?? FALLBACK_TIME_ZONE);
  let timeFormat: TimeFormat = controlled.timeFormat
    ? (givenInputs.timeFormat as TimeFormat)
    : (givenInputs.defaultTimeFormat ?? DEFAULT_TIME_FORMAT);

  /**
   * Whether the value has been settled once. A `default*` arriving for the first
   * time is the initial value — a binding cannot read the browser's zone before it
   * mounts — while a later change is ignored, because re-initialising would
   * overwrite what the user chose.
   */
  let timeZoneInitialized = controlled.timeZone || givenInputs.defaultTimeZone !== undefined;
  let timeFormatInitialized = controlled.timeFormat || givenInputs.defaultTimeFormat !== undefined;

  function resolveConfig(): BookingConfig {
    // The adapter is the authority on what it can guarantee, so its declaration
    // wins over anything the configuration says about idempotency.
    const capabilities = adapter.capabilities ?? configOverrides.capabilities;
    return resolveBookingConfig({
      ...configOverrides,
      ...(capabilities ? { capabilities } : {}),
      timeZone,
      timeFormat,
    });
  }

  let config = resolveConfig();

  /* -- time ----------------------------------------------------------------- */

  let anchor = createTimeAnchor(options.initialTime ?? clock.now(), timeZone);

  /* -- state ---------------------------------------------------------------- */

  const initialDuration = controlled.duration
    ? (givenInputs.duration as number)
    : (givenInputs.defaultDuration ?? config.durationOptions[0] ?? 15);
  const initialValues: BookingValues = controlled.values
    ? (givenInputs.values as unknown as BookingValues)
    : ((givenInputs.defaultValues ??
        config.defaultValues ??
        createEmptyValues(config.fields)) as unknown as BookingValues);
  let lastEmittedSelection: BookingSelection = null;

  let state = createBookingState({
    duration: initialDuration,
    month: monthKeyOf(clampDayKey(config.minDate ?? anchor.today, config.minDate, config.maxDate)),
    values: initialValues,
    ...(options.initialAttempt ? { attempt: restoreAttempt(options.initialAttempt) } : {}),
  });

  // The selection the application handed over is not news: it is the baseline.
  lastEmittedSelection = selectionOf(state);

  /* -- bookkeeping ---------------------------------------------------------- */

  const listeners = new Set<() => void>();
  let stateRevision = 0;
  let configRevision = 0;
  let batchDepth = 0;
  let pendingNotification = false;
  let cachedKey = '';
  let cached: BookingSnapshot | null = null;
  let snapshotRevision = 0;

  let started = false;
  let cancelBoundary: (() => void) | null = null;

  let daysToken = 0;
  let slotsToken = 0;
  let availabilityAbort: AbortController | null = null;
  let slotsAbort: AbortController | null = null;

  /** The last selection this controller proposed from freshly fetched data. */
  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  /**
   * Reports a selection the state no longer holds.
   *
   * A preset the calendar refuses, an offer invalidated by a duration change, a
   * selection dropped because availability moved: the application has to hear about
   * all of them, or a controlled value and the widget disagree.
   */
  function notifySelection(): void {
    const current = selectionOf(state);
    if (sameSelection(current, lastEmittedSelection)) return;
    lastEmittedSelection = current;
    handlers.onSelectionChange?.(current, metadata(state.selectionReason ?? 'availability-change'));
  }

  function emit(): void {
    if (batchDepth > 0) {
      pendingNotification = true;
      return;
    }
    notifySelection();
    notify();
  }

  function batch(run: () => void): void {
    batchDepth += 1;
    try {
      run();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && pendingNotification) {
        pendingNotification = false;
        notifySelection();
        notify();
      }
    }
  }

  function apply(action: BookingAction): void {
    const previous = state;
    const next = bookingReducer(state, action);
    if (next === previous) return;

    // The state changes before anyone is told, so a listener always reads the
    // value that goes with the notification.
    state = next;
    stateRevision += 1;
    emit();
    scheduleBoundary();
    syncLoads(previous);
  }

  function syncLoads(previous: BookingState): void {
    if (!started) return;
    const availability = previous.month !== state.month || previous.duration !== state.duration;
    const slots =
      previous.selectedDate !== state.selectedDate ||
      previous.duration !== state.duration ||
      previous.selectionNonce !== state.selectionNonce;
    if (availability) loadAvailability();
    if (slots) loadSlots();
  }

  /* -- snapshot ------------------------------------------------------------- */

  function retryOpen(): boolean {
    const attempt = state.attempt;
    if (!attempt || attempt.status !== 'unknown') return false;
    return isRetrySafe(attempt.startedAt, config.capabilities, anchor.nowMs);
  }

  /**
   * The part of the time reference the view depends on. `nowMs` moves constantly
   * and must never invalidate the cache, but the zone offset at the meeting (or,
   * with nothing selected, right now) does change the rendered zone name.
   */
  function timeViewKey(): string {
    const at = state.selectedSlot?.start ?? new Date(anchor.nowMs).toISOString();
    return `${timeAnchorKey(anchor, retryOpen())}|${formatUtcOffset(at, timeZone)}`;
  }

  function snapshotKey(): string {
    return `${stateRevision}|${configRevision}|${timeViewKey()}`;
  }

  function getSnapshot(): BookingSnapshot {
    const key = snapshotKey();
    if (cached && key === cachedKey) return cached;

    snapshotRevision += 1;
    cachedKey = key;
    cached = {
      revision: snapshotRevision,
      state,
      view: deriveBookingView(state, config, anchor),
    };
    return cached;
  }

  /* -- metadata for every change event -------------------------------------- */

  function metadata(reason: SelectionChangeReason): BookingChangeMetadata {
    return {
      duration: state.duration,
      timeZone,
      contextKey: config.context.key,
      reason,
    };
  }

  /* -- loading -------------------------------------------------------------- */

  function availabilityQuery(signal: AbortSignal) {
    return {
      from: firstDayOfMonth(state.month),
      to: lastDayOfMonth(state.month),
      duration: state.duration,
      timeZone,
      context: config.context,
      signal,
    };
  }

  function loadAvailability(): void {
    if (!started) return;
    availabilityAbort?.abort();
    const controller = new AbortController();
    availabilityAbort = controller;
    const token = (daysToken += 1);
    apply({ type: 'daysLoading', token });

    void (async () => {
      try {
        const days = requireDays(
          await adapter.getAvailability(availabilityQuery(controller.signal)),
        );
        if (controller.signal.aborted) return;
        apply({ type: 'daysLoaded', token, days });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        const classified = toBookingError(error, 'ADAPTER_CONTRACT_VIOLATION');
        apply({
          type: 'daysFailed',
          token,
          error: messageOf(classified, config.messages.genericError),
        });
        handlers.onError?.(classified, { phase: 'availability', outcome: 'not_applicable' });
      }
    })();
  }

  function loadSlots(): void {
    if (!started) return;
    const date = state.selectedDate;
    if (!date) return;

    slotsAbort?.abort();
    const token = (slotsToken += 1);
    apply({ type: 'slotsLoading', token });

    // An adapter may inline the offers it already knows about; then there is
    // nothing to fetch.
    const inline = state.days[date]?.slots;
    if (inline && inline.length > 0) {
      const slots = requireSlots(inline);
      apply({ type: 'slotsLoaded', token, slots });
      return;
    }

    const controller = new AbortController();
    slotsAbort = controller;

    void (async () => {
      try {
        const slots = requireSlots(
          await adapter.getSlots({
            date,
            duration: state.duration,
            timeZone,
            context: config.context,
            signal: controller.signal,
          }),
        );
        if (controller.signal.aborted) return;
        apply({ type: 'slotsLoaded', token, slots });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        const classified = toBookingError(error, 'ADAPTER_CONTRACT_VIOLATION');
        apply({
          type: 'slotsFailed',
          token,
          error: messageOf(classified, config.messages.genericError),
        });
        handlers.onError?.(classified, { phase: 'slots', outcome: 'not_applicable' });
      }
    })();
  }

  /* -- the clock ------------------------------------------------------------ */

  function refreshAnchor(): void {
    const nowMs = clock.now();
    const next = createTimeAnchor(nowMs, timeZone);
    if (next.nowMs === anchor.nowMs && next.today === anchor.today) return;
    anchor = next;
    emit();
  }

  function scheduleBoundary(): void {
    cancelBoundary?.();
    cancelBoundary = null;
    if (!started) return;

    const attempt = state.attempt;
    const closesAt = attempt
      ? retryWindowClosesAt(attempt.startedAt, config.capabilities)
      : undefined;
    const at = soonestBoundary(anchor.nowMs, [midnightAfter(anchor.nowMs, timeZone), closesAt]);
    if (at === undefined) return;

    // A callback re-reads the clock and re-arms: the window may be longer than a
    // single timeout can express, and the timer is only a hint to look again. It
    // must never repeat a booking by itself.
    cancelBoundary = clock.schedule(at, () => {
      cancelBoundary = null;
      refreshAnchor();
      scheduleBoundary();
    });
  }

  /* -- creating a booking --------------------------------------------------- */

  function restoreAttempt(attempt: InitialBookingAttempt): BookingAttemptState {
    // A restored attempt is never "still running": this controller does not own
    // the request that produced it.
    return {
      idempotencyKey: attempt.idempotencyKey,
      request: attempt.request,
      startedAt: attempt.startedAt,
      status: 'unknown',
    };
  }

  function buildRequest(): BookingRequest<BookingValues> {
    const slot = state.selectedSlot as TimeSlot;
    return {
      // The request states the whole interval, even when the adapter only sent a
      // start: whoever receives it should not have to guess the duration back.
      slot: { ...slot, end: endOf(slot, state.duration) },
      date: state.selectedDate as string,
      duration: state.duration,
      timeZone,
      context: config.context,
      values: state.values,
      idempotencyKey: createIdempotencyKey(anchor.nowMs),
    };
  }

  function splitFieldErrors(fieldErrors: Record<string, string>): {
    mapped: Record<string, string>;
    formError: string | null;
  } {
    const unknown = new Set(unmappedFieldNames(fieldErrors, config.fields));
    const mapped: Record<string, string> = {};
    const unmapped: string[] = [];
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (unknown.has(field)) {
        unmapped.push(format(config.messages.unmappedFieldErrorDescription, { field }));
      } else {
        mapped[field] = message;
      }
    }
    return { mapped, formError: unmapped.length > 0 ? unmapped.join(' ') : null };
  }

  async function send(attempt: BookingAttemptState): Promise<void> {
    try {
      const result = requireResult(
        // The flow carries the payload as plain values; the adapter's own type is
        // what the application declared for its form.
        await adapter.createBooking(attempt.request as unknown as BookingRequest<TValues>),
      );
      try {
        handlers.onBooked?.(result, attempt.request);
      } catch {
        // The record exists. An application callback must not turn it into a
        // failure or make a repeat look safe.
      }
      apply({ type: 'submitSucceeded', idempotencyKey: attempt.idempotencyKey, result });
    } catch (error) {
      const classified = toBookingError(error, 'UNKNOWN_OUTCOME');
      const notCreated = guaranteesNotCreated(classified.code);
      handlers.onError?.(classified, {
        phase: 'booking',
        outcome: notCreated ? 'not_created' : 'unknown',
        request: attempt.request,
      });

      const message = messageOf(classified, config.messages.genericError);

      if (classified.code === 'SLOT_UNAVAILABLE') {
        // The offer went away: clear it first so the error lands on the step that
        // can actually fix it, and refresh what the adapter knows.
        batch(() => {
          apply({ type: 'clearSelection', reason: 'availability-change' });
          apply({
            type: 'submitFailed',
            idempotencyKey: attempt.idempotencyKey,
            error: message,
            code: classified.code,
          });
        });
        loadAvailability();
        loadSlots();
        return;
      }

      if (notCreated) {
        const { mapped, formError } = splitFieldErrors(classified.fieldErrors ?? {});
        apply({
          type: 'submitFailed',
          idempotencyKey: attempt.idempotencyKey,
          error: message,
          fieldErrors: mapped,
          formError,
          code: classified.code,
        });
        return;
      }

      apply({ type: 'submitUnknown', idempotencyKey: attempt.idempotencyKey });
    }
  }

  /* -- adopting values from the application --------------------------------- */

  function reachMonthOf(date: string): void {
    const month = monthKeyOf(date);
    if (month !== state.month) apply({ type: 'setMonth', month });
  }

  function withinLimits(date: string): boolean {
    if (config.minDate && date < config.minDate) return false;
    if (config.maxDate && date > config.maxDate) return false;
    return true;
  }

  function adoptValues(next: TValues): void {
    const values = next as unknown as BookingValues;
    if (sameInputs(state.values, values)) return;
    apply({ type: 'setValues', values });
  }

  function adoptDuration(next: number): void {
    if (next === state.duration) return;
    apply({ type: 'setDuration', duration: next });
  }

  function adoptTimeZone(
    next: string,
    reason: SelectionChangeReason,
    options: { initialization?: boolean } = {},
  ): void {
    timeZoneInitialized = true;
    if (next === timeZone) return;
    timeZone = next;
    const today = todayKey(timeZone, new Date(anchor.nowMs));
    anchor = { ...anchor, today };
    configRevision += 1;
    config = resolveConfig();

    // The same instant may now fall on another day, and the offer has to be
    // confirmed against that day before it can be booked again.
    if (state.selectedSlot) {
      const date = dayKeyOfInstant(state.selectedSlot.start, timeZone);
      reachMonthOf(date);
      apply({ type: 'selectionVerifying', reason, date });
      if (!withinLimits(date)) apply({ type: 'selectionRejected', reason });
    }

    emit();
    scheduleBoundary();
    loadAvailability();
    if (state.selectedDate) loadSlots();
  }

  function applyInputs(inputs: BookingControllerInputs<TValues>): void {
    if (controlled.timeZone) {
      if (inputs.timeZone !== undefined) adoptTimeZone(inputs.timeZone, 'time-zone-change');
    } else if (inputs.timeZone !== undefined) {
      warnOnce('timeZone');
    } else if (!timeZoneInitialized && inputs.defaultTimeZone !== undefined) {
      // The initial value arriving late, not a re-initialisation.
      if (inputs.defaultTimeZone !== timeZone) {
        adoptTimeZone(inputs.defaultTimeZone, 'time-zone-change', { initialization: true });
      }
    }

    if (controlled.timeFormat) {
      if (inputs.timeFormat !== undefined && inputs.timeFormat !== timeFormat) {
        adoptTimeFormat(inputs.timeFormat);
      }
    } else if (inputs.timeFormat !== undefined) {
      warnOnce('timeFormat');
    } else if (!timeFormatInitialized && inputs.defaultTimeFormat !== undefined) {
      if (inputs.defaultTimeFormat !== timeFormat) {
        adoptTimeFormat(inputs.defaultTimeFormat, { initialization: true });
      }
    }

    if (controlled.duration) {
      if (inputs.duration !== undefined) adoptDuration(inputs.duration);
    } else if (inputs.duration !== undefined) {
      warnOnce('duration');
    }

    if (controlled.values) {
      if (inputs.values !== undefined) adoptValues(inputs.values);
    } else if (inputs.values !== undefined) {
      warnOnce('values');
    }

    // `default*` values are initial by definition: changing them later must not
    // overwrite what the user has already entered.
  }

  /* -- actions -------------------------------------------------------------- */

  function proposeSelection(next: BookingSelection, reason: SelectionChangeReason): void {
    if (sameSelection(selectionOf(state), next)) return;

    if (!next) {
      apply({ type: 'clearSelection', reason });
    } else if (next.slot) {
      apply({ type: 'selectSlot', slot: next.slot });
    } else {
      apply({ type: 'selectDate', date: next.date, reason });
    }
  }

  function setDuration(minutes: number): void {
    if (minutes === state.duration) return;
    if (controlled.duration) {
      handlers.onDurationChange?.(minutes, metadata('duration-change'));
      return;
    }
    apply({ type: 'setDuration', duration: minutes });
    handlers.onDurationChange?.(minutes, metadata('duration-change'));
  }

  function setValues(values: BookingValues): void {
    const merged = { ...state.values, ...values };
    if (sameInputs(state.values, merged)) return;
    if (controlled.values) {
      handlers.onValuesChange?.(merged, metadata('values-change'));
      return;
    }
    apply({ type: 'setValues', values: merged });
    handlers.onValuesChange?.(merged, metadata('values-change'));
  }

  function setTimeZone(next: string): void {
    if (next === timeZone) return;
    if (controlled.timeZone) {
      handlers.onTimeZoneChange?.(next, metadata('time-zone-change'));
      return;
    }
    adoptTimeZone(next, 'time-zone-change');
    handlers.onTimeZoneChange?.(next, metadata('time-zone-change'));
  }

  function adoptTimeFormat(next: TimeFormat, options: { initialization?: boolean } = {}): void {
    timeFormatInitialized = true;
    if (next === timeFormat) return;
    timeFormat = next;
    configRevision += 1;
    config = resolveConfig();
    emit();
    if (!options.initialization) {
      handlers.onTimeFormatChange?.(next, metadata('time-format-change'));
    }
  }

  function setTimeFormat(next: TimeFormat): void {
    if (next === timeFormat) return;
    if (controlled.timeFormat) {
      handlers.onTimeFormatChange?.(next, metadata('time-format-change'));
      return;
    }
    adoptTimeFormat(next);
  }

  function setContext(context: BookingContext): void {
    if (context.key === config.context.key && context.data === config.context.data) return;
    configOverrides = { ...configOverrides, context };
    config = resolveConfig();
    configRevision += 1;
    // A different schedule cannot keep the old choice, in either mode; the
    // controlled owner is told so that it can drop its value too.
    apply({ type: 'contextChanged' });
    emit();
    handlers.onContextChange?.(context, metadata('context-change'));
    loadAvailability();
  }

  /* -- public API ----------------------------------------------------------- */

  const actions: BookingControllerActions = {
    selectDate(date) {
      // Switching day keeps the flow as it is, and re-asks the adapter.
      apply({ type: 'selectDate', date, reason: 'date-select' });
    },

    selectSlot(slot) {
      const date = state.selectedDate;
      if (!date) return;
      proposeSelection({ date, slot }, 'slot-select');
    },

    setDuration,
    setValues,

    touchField(field) {
      apply({ type: 'touch', field });
    },

    setTimeZone,
    setTimeFormat,

    setContext(context) {
      setContext(context);
    },

    clearSelection(reason = 'availability-change') {
      apply({ type: 'clearSelection', reason });
      handlers.onSelectionChange?.(null, metadata(reason));
    },

    goToMonth(month) {
      apply({ type: 'setMonth', month });
    },

    previousMonth() {
      actions.goToMonth(addMonths(state.month, -1));
    },

    nextMonth() {
      actions.goToMonth(addMonths(state.month, 1));
    },

    back() {
      if (state.step === 'date' || state.step === 'confirmed') {
        handlers.onDismiss?.();
        return;
      }
      apply({ type: 'back' });
    },

    async submit() {
      if (state.attempt && state.attempt.status === 'unknown') return;
      if (state.submitStatus === 'submitting') return;

      // Touching every field is what makes the validation messages appear.
      batch(() => {
        for (const field of config.fields) apply({ type: 'touch', field: field.name });
      });

      const errors = validateBookingValues(
        state.values,
        config.fields,
        config.messages,
        config.validateValues,
      );
      if (Object.keys(errors).length > 0) return;
      if (state.selectionStatus !== 'valid' || !state.selectedSlot || !state.selectedDate) return;

      // One key per attempt, and the request carries it. Generating the two
      // separately is how `resolveAttempt` — which is given the key from the frozen
      // request — would refuse the very attempt it is meant to resolve.
      const request = buildRequest();
      const attempt: BookingAttemptState = {
        idempotencyKey: request.idempotencyKey,
        request,
        startedAt: anchor.nowMs,
        status: 'pending',
        scenarioId: state.scenarioId,
      };
      apply({ type: 'submitStart', attempt });
      await send(attempt);
    },

    retry() {
      const attempt = state.attempt;
      if (!attempt || attempt.status !== 'unknown') return;
      // Re-read the clock right before sending: a late timer must never authorise
      // an expired window.
      refreshAnchor();
      if (!isRetrySafe(attempt.startedAt, config.capabilities, anchor.nowMs)) return;
      apply({ type: 'attemptRetryStart' });
      void send({ ...attempt, status: 'pending' });
    },

    resolveAttempt({ idempotencyKey, outcome, message }) {
      const attempt = state.attempt;
      if (!attempt || attempt.idempotencyKey !== idempotencyKey) return false;

      if (outcome.status === 'created') {
        try {
          handlers.onBooked?.(outcome.result, attempt.request);
        } catch {
          // Same rule as in `send`: the record exists.
        }
      }
      apply({ type: 'resolveAttempt', outcome, ...(message === undefined ? {} : { message }) });

      if (outcome.status === 'not_created') {
        if (state.selectedDate) loadSlots();
        loadAvailability();
      }
      return true;
    },

    reset() {
      apply({
        type: 'reset',
        values: config.defaultValues ?? createEmptyValues(config.fields),
      });
      if (controlled.values) {
        handlers.onValuesChange?.(
          config.defaultValues ?? createEmptyValues(config.fields),
          metadata('reset'),
        );
      }
    },

    reloadAvailability() {
      loadAvailability();
    },

    reloadSlots() {
      loadSlots();
    },
  };

  return {
    getSnapshot,
    getTimeAnchor: () => anchor,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateAdapter(next) {
      if (next === adapter) return;
      // Creation is where the mode and the adapter are paired; a selection never
      // reaches a booking method, so the reference is kept in the booking shape.
      adapter = next as BookingAdapter<TValues>;
      configRevision += 1;
      config = resolveConfig();
      emit();
    },
    updateConfig(next) {
      if (sameInputs(configOverrides, next)) return;
      const previous = config;
      configOverrides = next;
      config = resolveConfig();
      configRevision += 1;

      // A different schedule is a different flow; everything else is presentation.
      if (previous.context.key !== config.context.key) {
        apply({ type: 'contextChanged' });
        loadAvailability();
      }
      if (previous.minDate !== config.minDate || previous.maxDate !== config.maxDate) {
        if (state.selectedDate && !withinLimits(state.selectedDate)) {
          apply({ type: 'selectionRejected', reason: 'availability-change' });
        }
      }
      if (!config.durationOptions.includes(state.duration) && !controlled.duration) {
        const nextDuration = config.durationOptions[0];
        if (nextDuration !== undefined) apply({ type: 'setDuration', duration: nextDuration });
      }
      emit();
    },
    updateInputs(inputs) {
      applyInputs(inputs);
    },
    actions,
    start() {
      if (started) return;
      started = true;
      refreshAnchor();
      scheduleBoundary();
      loadAvailability();
      if (state.selectedDate) loadSlots();
    },
    stop() {
      if (!started) return;
      started = false;
      availabilityAbort?.abort();
      slotsAbort?.abort();
      availabilityAbort = null;
      slotsAbort = null;
      cancelBoundary?.();
      cancelBoundary = null;
      // A creation already sent is not cancelled: the record may exist.
    },
    refreshTime() {
      refreshAnchor();
      scheduleBoundary();
    },
  };
}
