/* -------------------------------------------------------------------------- */
/*  Domain model                                                               */
/* -------------------------------------------------------------------------- */

/** A bookable instant. `start` is an ISO 8601 string, ideally with an offset. */
export interface TimeSlot {
  /** ISO 8601 instant, e.g. `2026-05-18T09:15:00+02:00` or `2026-05-18T07:15:00Z`. */
  start: string;
  /** Optional ISO 8601 instant. Derived from `start` + duration when omitted. */
  end?: string;
}

/**
 * Availability for a single calendar day.
 *
 * The widget only needs `date` to draw an availability dot under the day;
 * `slotCount` (when known) is announced to assistive technology.
 */
export interface DayAvailability {
  /** Calendar day in the configured time zone, formatted as `YYYY-MM-DD`. */
  date: string;
  /** Number of bookable slots; falls back to `slots.length` when provided. */
  slotCount?: number;
  /** Explicit slots for the day. When present, the widget skips `getSlots()`. */
  slots?: TimeSlot[];
}

/** First query the widget issues: which days in a month are bookable. */
export interface AvailabilityQuery {
  /** First day of the requested range, `YYYY-MM-DD` in `timeZone`. */
  from: string;
  /** Last day of the requested range, inclusive, `YYYY-MM-DD` in `timeZone`. */
  to: string;
  /** Duration in minutes the user selected. */
  duration: number;
  /** IANA time zone the widget renders in. */
  timeZone: string;
  /** Aborted when the month changes or the widget unmounts. */
  signal: AbortSignal;
}

/** Second query: the concrete slots of the chosen day. */
export interface SlotsQuery {
  /** Calendar day in `timeZone`, `YYYY-MM-DD`. */
  date: string;
  duration: number;
  timeZone: string;
  signal: AbortSignal;
}

export interface BookingDetails {
  name: string;
  email: string;
  notes?: string;
}

/** Everything the backend needs to create the booking. */
export interface BookingRequest {
  slot: TimeSlot;
  /** Calendar day of `slot.start` in `timeZone`, `YYYY-MM-DD`. */
  date: string;
  duration: number;
  timeZone: string;
  details: BookingDetails;
}

/** Anything the backend returns; `id` and `inviteeEmail` are read when present. */
export interface BookingResult {
  id?: string;
  /** Email the calendar invite was sent to. Defaults to `details.email`. */
  inviteeEmail?: string;
  [key: string]: unknown;
}

/**
 * The only integration point: supply availability and persist the booking.
 * Slotline owns the UI and the flow, never your data.
 *
 * @example
 * ```ts
 * const adapter: BookingAdapter = {
 *   async getAvailability({ from, to, duration, timeZone, signal }) {
 *     const res = await fetch(`/api/availability?from=${from}&to=${to}&duration=${duration}&tz=${timeZone}`, { signal });
 *     return res.json();
 *   },
 *   async getSlots({ date, duration, timeZone, signal }) {
 *     const res = await fetch(`/api/slots?date=${date}&duration=${duration}&tz=${timeZone}`, { signal });
 *     return res.json();
 *   },
 *   async createBooking(request) {
 *     const res = await fetch('/api/bookings', { method: 'POST', body: JSON.stringify(request) });
 *     if (!res.ok) throw new Error('Booking failed');
 *     return res.json();
 *   },
 * };
 * ```
 */
export interface BookingAdapter {
  getAvailability(query: AvailabilityQuery): Promise<DayAvailability[]>;
  getSlots(query: SlotsQuery): Promise<TimeSlot[]>;
  createBooking(request: BookingRequest): Promise<BookingResult>;
}

/* -------------------------------------------------------------------------- */
/*  Flow                                                                       */
/* -------------------------------------------------------------------------- */

/** `date` → `time` → `details` → `confirmed`. */
export type SlotlineStep = 'date' | 'time' | 'details' | 'confirmed';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  /** Invite line on the confirmation step. `{email}`. */
  inviteSent: string;
  /** Button that restarts the flow. */
  bookAnother: string;
  /** Headline shown while the confirmation renders. */
  bookedTitle: string;
  /** Zone hint under the calendar. `{zone}` → "Times shown in GMT+2". */
  timeZoneHint: string;
  /** Short weekday labels, Sunday-first. Ignored for 7+ slot locales. */
  weekdays?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Theme                                                                      */
/* -------------------------------------------------------------------------- */

export type SlotlineTheme = 'dark' | 'light' | 'system';
