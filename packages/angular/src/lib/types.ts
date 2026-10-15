import type {
  AvailabilityAdapter,
  BookingAdapter,
  BookingChangeMetadata,
  BookingContext,
  BookingError,
  BookingErrorContext,
  BookingRequest,
  BookingResult,
  BookingSelection,
  DefaultBookingValues,
  InitialBookingAttempt,
  SlotlineClassSlot,
  SlotlineMessages,
  SlotlineTheme,
  TimeFormat,
} from '@nickkupriyanov/slotline-core';

/**
 * Everything the standalone widget accepts.
 *
 * The names match the React binding's props on purpose: an application that
 * switches binding should not have to learn a second vocabulary.
 */
export interface SlotlineComponentInputs<TValues = DefaultBookingValues> {
  /**
   * The adapter the flow works against. A `selection` needs availability and slots;
   * a `booking` also persists them, and the controller enforces the pairing.
   */
  adapter: BookingAdapter<TValues> | AvailabilityAdapter<TValues>;
  /** Duration options in minutes. Default: `[15, 30, 60]`. */
  durations?: number[];
  /** Controlled duration, in minutes. */
  duration?: number;
  /** Uncontrolled initial duration. Default: the first option. */
  defaultDuration?: number;
  /** IANA zone used for every date and time rendered. */
  timeZone?: string;
  /** Uncontrolled initial zone. */
  defaultTimeZone?: string;
  locale?: string;
  messages?: Partial<SlotlineMessages>;
  theme?: SlotlineTheme;
  title?: string;
  minDate?: string | Date;
  maxDate?: string | Date;
  weekStartsOn?: 0 | 1;
  timeFormat?: TimeFormat;
  defaultTimeFormat?: TimeFormat;
  context?: BookingContext;
  /** Per-part class overrides; the class names come from the core stylesheet. */
  classNames?: Partial<Record<SlotlineClassSlot, string>>;
  /** An attempt restored after a reload: the widget opens on its screen. */
  attempt?: InitialBookingAttempt | null;
  /** Move focus into the widget once it is rendered. */
  autoFocus?: boolean;
  /** Keep `Tab` inside the card and let `Escape` go back. */
  trapFocus?: boolean;
}

/** Payload of every change event: the new value plus the metadata of the change. */
export interface DurationChangeEvent {
  duration: number;
  metadata: BookingChangeMetadata;
}

export interface TimeZoneChangeEvent {
  timeZone: string;
  metadata: BookingChangeMetadata;
}

export interface TimeFormatChangeEvent {
  timeFormat: TimeFormat;
  metadata: BookingChangeMetadata;
}

export interface ContextChangeEvent {
  context: BookingContext;
  metadata: BookingChangeMetadata;
}

export interface BookedEvent<TValues = DefaultBookingValues> {
  result: BookingResult;
  request: BookingRequest<TValues>;
}

export interface FailedEvent {
  error: BookingError;
  context: BookingErrorContext;
}
