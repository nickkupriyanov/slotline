/* -------------------------------------------------------------------------- */
/*  Domain model                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A bookable offer.
 *
 * `id` is the identity of the offer inside its context: selection, element keys
 * and offer restoration all use it, and it must not change when the time zone
 * the widget renders in changes. Display data (price, specialist, room,
 * capacity) belongs in `data`, never in the identity.
 */
export interface TimeSlot<TData = unknown> {
  /** Stable offer id. Unique within a context. */
  id: string;
  /** ISO 8601 instant, e.g. `2026-05-18T09:15:00+02:00` or `2026-05-18T07:15:00Z`. */
  start: string;
  /** Optional ISO 8601 instant. Derived from `start` + duration when omitted. */
  end?: string;
  /** Typed display data: price, specialist, room, capacity. */
  data?: TData;
}

/**
 * Availability for a single calendar day.
 *
 * The widget only needs `date` to draw an availability dot under the day;
 * `slotCount` (when known) is announced to assistive technology.
 */
export interface DayAvailability<TData = unknown> {
  /** Calendar day in the configured time zone, formatted as `YYYY-MM-DD`. */
  date: string;
  /** Number of bookable slots; falls back to `slots.length` when provided. */
  slotCount?: number;
  /** Explicit slots for the day. When present, the widget skips `getSlots()`. */
  slots?: TimeSlot<TData>[];
}

/**
 * The schedule a booking belongs to. `key` identifies it: changing the key means
 * a different schedule, so availability is refetched, the selection is cleared
 * and in-flight responses are dropped. `data` carries typed schedule data.
 */
export interface BookingContext<TData = unknown> {
  key: string;
  data?: TData;
}

/**
 * Values of the built-in form: name + email, with optional notes.
 *
 * A type alias rather than an interface on purpose: only aliases get the implicit
 * index signature that lets a typed payload be read as `BookingValues`.
 */
export type DefaultBookingValues = {
  name: string;
  email: string;
  notes?: string;
};

/** Any typed form payload. Custom forms use their own shape. */
export type BookingValues = Record<string, unknown>;

/** First query the widget issues: which days in a month are bookable. */
export interface AvailabilityQuery<TContextData = unknown> {
  /** First day of the requested range, `YYYY-MM-DD` in `timeZone`. */
  from: string;
  /** Last day of the requested range, inclusive, `YYYY-MM-DD` in `timeZone`. */
  to: string;
  /** Duration in minutes the user selected. */
  duration: number;
  /** IANA time zone the widget renders in. */
  timeZone: string;
  /** Schedule the availability belongs to. */
  context: BookingContext<TContextData>;
  /** Aborted when the month changes or the widget unmounts. */
  signal: AbortSignal;
}

/** Second query: the concrete slots of the chosen day. */
export interface SlotsQuery<TContextData = unknown> {
  /** Calendar day in `timeZone`, `YYYY-MM-DD`. */
  date: string;
  duration: number;
  timeZone: string;
  context: BookingContext<TContextData>;
  signal: AbortSignal;
}

/** Values of the built-in form. Alias kept while the `0.1` flow is retired. */
export type BookingDetails = DefaultBookingValues;

/** Everything the backend needs to create the booking. */
export interface BookingRequest<
  TValues = DefaultBookingValues,
  TContextData = unknown,
  TSlotData = unknown,
> {
  slot: TimeSlot<TSlotData>;
  /** Calendar day of `slot.start` in `timeZone`, `YYYY-MM-DD`. */
  date: string;
  duration: number;
  timeZone: string;
  context: BookingContext<TContextData>;
  /** Typed form payload. */
  values: TValues;
  /**
   * Identifies the creation attempt. A repeat of the same attempt reuses the
   * key and the payload; a new deliberate operation gets a new key.
   */
  idempotencyKey: string;
}

/** Delivery status of the calendar invitation, reported explicitly by the backend. */
export interface BookingInvitation {
  status: 'sent' | 'pending' | 'failed';
  email?: string;
}

/**
 * The created booking. `id` identifies the record (not the offer); `status` is
 * `'confirmed'` for a booking the backend created. Additional agreed fields are
 * allowed, so an adapter can pass its own payload through.
 */
export interface BookingResult {
  /** Identifier of the created booking record. */
  id: string;
  status: 'confirmed';
  invitation?: BookingInvitation;
  location?: string;
  instructions?: string;
  joinUrl?: string;
  calendarUrl?: string;
  rescheduleUrl?: string;
  cancelUrl?: string;
  [key: string]: unknown;
}

/** What the adapter can guarantee about `createBooking`. */
export type BookingCapabilities =
  | { idempotentCreate?: false; idempotencyRetentionMs?: never }
  | { idempotentCreate: true; idempotencyRetentionMs: number };

/** Availability and slots. Enough for `mode: 'selection'`. */
export interface AvailabilityAdapter<TContextData = unknown, TSlotData = unknown> {
  getAvailability(query: AvailabilityQuery<TContextData>): Promise<DayAvailability<TSlotData>[]>;
  getSlots(query: SlotsQuery<TContextData>): Promise<TimeSlot<TSlotData>[]>;
}

/**
 * The integration point for booking: availability, offers and creation.
 * Slotline owns the UI and the flow, never your data.
 *
 * `capabilities` is optional, and absent means "no idempotent create", so a
 * repeat of an attempt whose outcome is unknown is never offered silently.
 *
 * @example
 * ```ts
 * const adapter: BookingAdapter = {
 *   async getAvailability({ from, to, duration, timeZone, context, signal }) { … },
 *   async getSlots({ date, duration, timeZone, context, signal }) { … },
 *   async createBooking({ slot, values, idempotencyKey }) {
 *     const res = await fetch('/api/bookings', {
 *       method: 'POST',
 *       headers: { 'idempotency-key': idempotencyKey },
 *       body: JSON.stringify({ slotId: slot.id, values }),
 *     });
 *     if (!res.ok) throw new BookingError({ code: 'GENERIC_FAILURE', message: 'Booking failed' });
 *     return res.json();
 *   },
 * };
 * ```
 */
export interface BookingAdapter<
  TValues = DefaultBookingValues,
  TContextData = unknown,
  TSlotData = unknown,
> extends AvailabilityAdapter<TContextData, TSlotData> {
  createBooking(request: BookingRequest<TValues, TContextData, TSlotData>): Promise<BookingResult>;
  capabilities?: BookingCapabilities;
}

/* -------------------------------------------------------------------------- */
/*  Flow                                                                       */
/* -------------------------------------------------------------------------- */

export type SlotlineStep = 'date' | 'time' | 'details' | 'attempt' | 'confirmed';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Hour cycle used for every rendered time. Default: `'24h'`. */
export type TimeFormat = '12h' | '24h';

/** The atomic selection: one date and at most one offer. */
export type BookingSelection = {
  date: string;
  slot: TimeSlot | null;
} | null;

/** Why a selection, duration, time zone, context, values or format changed. */
export type SelectionChangeReason =
  | 'date-select'
  | 'slot-select'
  | 'duration-change'
  | 'time-zone-change'
  | 'time-format-change'
  | 'values-change'
  | 'context-change'
  | 'availability-change'
  | 'reset';

/** Metadata every change event carries. */
export interface BookingChangeMetadata {
  duration: number;
  timeZone: string;
  contextKey: string;
  reason: SelectionChangeReason;
}

/**
 * The time the controller reasons about. `today` is a calendar day in the
 * configured zone; `nowMs` is needed for the safe-retry window.
 */
export interface BookingTimeAnchor {
  nowMs: number;
  /** `YYYY-MM-DD` in the accepted `timeZone`. */
  today: string;
}

/**
 * Injectable time source. `schedule` registers a callback for an absolute
 * moment (midnight in the zone, expiry of the retry window) and returns its
 * canceller.
 */
export interface BookingClock {
  now(): number;
  schedule(atMs: number, callback: () => void): () => void;
}

/** An attempt restored by the application after a reload. */
export interface InitialBookingAttempt {
  idempotencyKey: string;
  /**
   * The request that was sent. Typed as plain values: the form payload's own type
   * belongs to the application, and this record may have been written by an
   * earlier version of it.
   */
  request: Readonly<BookingRequest<BookingValues>>;
  /** Unix time in milliseconds, set before the first send. */
  startedAt: number;
  status: 'pending' | 'unknown';
}

/** What the application learned about an attempt whose outcome was unknown. */
export type BookingAttemptOutcome =
  { status: 'created'; result: BookingResult } | { status: 'not_created' } | { status: 'unknown' };

/** Classes the widget renders, stable enough to target from consumer CSS. */
export type SlotlineClassSlot =
  | 'root'
  | 'card'
  | 'header'
  | 'title'
  | 'badge'
  | 'progress'
  | 'panel'
  | 'footer'
  | 'calendar'
  | 'calendarHeader'
  | 'monthLabel'
  | 'navButton'
  | 'weekdays'
  | 'weekday'
  | 'grid'
  | 'day'
  | 'dayDot'
  | 'slotsHeader'
  | 'slotsCount'
  | 'slots'
  | 'slot'
  | 'summary'
  | 'form'
  | 'field'
  | 'input'
  | 'submit'
  | 'error'
  | 'empty'
  | 'skeleton'
  | 'confirmation'
  | 'confirmationIcon'
  | 'confirmationTitle'
  | 'confirmationText'
  | 'secondaryButton';

/* -------------------------------------------------------------------------- */
/*  Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Categories a failure can fall into.
 *
 * Every category except `UNKNOWN_OUTCOME` and `ADAPTER_CONTRACT_VIOLATION` is a
 * guarantee that the booking was not created, which is what makes a safe retry
 * possible.
 */
export type BookingErrorCode =
  | 'SLOT_UNAVAILABLE'
  | 'VALIDATION_FAILED'
  | 'TEMPORARY_FAILURE'
  | 'GENERIC_FAILURE'
  | 'UNKNOWN_OUTCOME'
  | 'ADAPTER_CONTRACT_VIOLATION';

/* -------------------------------------------------------------------------- */
/*  i18n                                                                       */
/* -------------------------------------------------------------------------- */

export type BuiltInLocale = 'en' | 'ru';

/** Every string the widget can render. Placeholders use `{name}` syntax. */
export interface SlotlineMessages {
  /** Header title on every step except the confirmation. Default: "Book a meeting". */
  title: string;
  /** Header title on the confirmation step. Default: "Booked". */
  bookedHeader: string;
  /** Accessible label for the progress indicator. `{step}` and `{total}`. */
  progressLabel: string;
  /** `{count}` → "15 min". Used for the header badge and the summary. */
  duration: string;
  /** Visible label in front of the duration pills. */
  durationLabel: string;
  /** Accessible label of the duration pill group. */
  durationGroupLabel: string;
  /** Accessible label for the "previous month" button. */
  previousMonth: string;
  /** Accessible label for the "next month" button. */
  nextMonth: string;
  /** Accessible label for the "back" button. */
  back: string;
  /** Accessible label of the calendar grid. */
  calendarLabel: string;
  /** Calendar hint for screen readers when a day has no slots. */
  dayUnavailable: string;
  /** `{date}` and `{count}` → "Monday, May 18 · 24 slots". */
  slotsCount: string;
  /** Heading of the time step when the adapter returned nothing. */
  noSlotsTitle: string;
  /** Body copy of the time step when the adapter returned nothing. */
  noSlotsBody: string;
  /** Button that sends the user back to the calendar from an empty day. */
  pickAnotherDay: string;
  /** Accessible label of the slot list. */
  slotsLabel: string;
  /** Placeholder and label of the name input. */
  nameLabel: string;
  /** Placeholder and label of the email input. */
  emailLabel: string;
  /** Primary call to action on the details step. */
  confirm: string;
  /** Primary call to action while the request is in flight. */
  confirming: string;
  /** Validation message for an empty name. */
  nameRequired: string;
  /** Validation message for an empty email. */
  emailRequired: string;
  /** Validation message for a malformed email. */
  emailInvalid: string;
  /** Fallback error when the adapter rejects. */
  genericError: string;
  /** Retry affordance next to an error message. */
  retry: string;
  /** Summary line on the confirmation step. `{date}`, `{time}`, `{duration}`. */
  bookedSummary: string;
  /** Button that restarts the flow. */
  bookAnother: string;
  /** Headline shown while the confirmation renders. */
  bookedTitle: string;
  /** Zone hint under the calendar. `{zone}` → "Times shown in GMT+2". */
  timeZoneHint: string;

  /* -- Booking attempt ---------------------------------------------------- */

  /** Headline while the creation request is in flight. */
  attemptPendingTitle: string;
  /** Body copy while the creation request is in flight. */
  attemptPendingDescription: string;
  /** Label of the frozen summary of the submitted request. */
  attemptSummaryLabel: string;
  /** Headline when the outcome of the creation request is unknown. */
  attemptUnknownTitle: string;
  /** Body copy when the outcome is unknown: the booking may exist. */
  attemptUnknownDescription: string;
  /** What the user should do before retrying. */
  attemptUnknownInstructions: string;

  /* -- Safe retry --------------------------------------------------------- */

  /** Label of the button that repeats the frozen attempt. */
  retryBookingLabel: string;
  /** Explanation shown next to a safe retry. */
  retryBookingDescription: string;
  /** Explanation when a retry is not safe without checking the outcome. */
  retryUnavailableDescription: string;
  /** Explanation when the safe-retry window has expired. */
  retryWindowExpiredDescription: string;
  /** Label of the affordance that asks the application to check the outcome. */
  checkBookingStatusLabel: string;

  /* -- Form errors -------------------------------------------------------- */

  /** Heading of the form-level error area. */
  formErrorsSummaryTitle: string;
  /** Error reported for a field the form does not know. `{field}`. */
  unmappedFieldErrorDescription: string;
  /** Error for a required field that brings its own copy. `{field}`. */
  fieldRequired: string;

  /* -- Invitation --------------------------------------------------------- */

  /** `{email}` → "Calendar invite sent to ann@example.com." */
  /** Heading above the place of an in-person booking. */
  confirmationLocationLabel: string;
  /** Opens the meeting link the backend returned. */
  confirmationJoinLabel: string;
  /** Opens the calendar entry the backend returned. No ICS is generated here. */
  confirmationAddToCalendarLabel: string;
  /** Opens the application's own rescheduling interface. */
  confirmationRescheduleLabel: string;
  /** Opens the application's own cancellation interface. */
  confirmationCancelLabel: string;

  invitationSentDescription: string;
  /** `{email}` → the invite is being sent. */
  invitationPendingDescription: string;
  /** `{email}` → the invite could not be sent. */
  invitationFailedDescription: string;

  /* -- Time zone ---------------------------------------------------------- */

  /** Visible label of the time zone selector. */
  timeZoneLabel: string;
  /** Accessible label of the time zone search field. */
  timeZoneSearchLabel: string;
  /** Placeholder of the time zone search field. */
  timeZoneSearchPlaceholder: string;
  /** Shown when the search matches nothing. */
  timeZoneNoResultsDescription: string;

  /* -- Time format -------------------------------------------------------- */

  /** Visible label of the time format selector. */
  timeFormatLabel: string;
  /** Label of the 12-hour option. */
  timeFormat12HourLabel: string;
  /** Label of the 24-hour option. */
  timeFormat24HourLabel: string;

  /* -- Ambiguous local time ----------------------------------------------- */

  /** `{offset}` → "UTC+02:00", shown beside a slot that repeats locally. */
  slotUtcOffsetDescription: string;

  /** Short weekday labels, Sunday-first. Ignored for 7+ slot locales. */
  weekdays?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Theme                                                                      */
/* -------------------------------------------------------------------------- */

export type SlotlineTheme = 'dark' | 'light' | 'system';
