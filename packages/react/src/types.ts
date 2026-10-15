import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type {
  AvailabilityAdapter,
  BookingAdapter,
  BookingFormMode,
  BookingMode,
  BookingChangeMetadata,
  BookingContext,
  BookingError,
  BookingErrorContext,
  BookingRequest,
  BookingResult,
  BookingSelection,
  BuiltInLocale,
  DefaultBookingValues,
  InitialBookingAttempt,
  SlotlineClassSlot,
  SlotlineMessages,
  SlotlineTheme,
  TimeFormat,
} from '@nickkupriyanov/slotline-core';

/**
 * React-facing types of the widget.
 *
 * The framework-free half — the domain model, the flow types and the copy —
 * lives in `@nickkupriyanov/slotline-core` and is re-exported here, so modules
 * in this package keep importing from `./types` exactly as before.
 */
export type * from '@nickkupriyanov/slotline-core';

/* -------------------------------------------------------------------------- */
/*  Component props                                                            */
/* -------------------------------------------------------------------------- */

/** Component props. `TValues` is inferred from the adapter, so a custom form keeps its own type. */
export interface SlotlineProps<TValues = DefaultBookingValues> {
  /**
   * The adapter the flow works against.
   *
   * A `selection` needs availability and slots; a `booking` also persists them, and
   * the controller enforces the pairing. Typing the two shapes loosely here keeps
   * the props readable for the common booking case — an application that selects
   * only never has to write a `createBooking` stub.
   */
  adapter: BookingAdapter<TValues> | AvailabilityAdapter<TValues>;
  /** `selection` stops at the offer and never creates anything. Default: `booking`. */
  mode?: BookingMode;
  /**
   * `skip` leaves the values to the application and keeps only the resume and an
   * explicit confirmation. Default: `collect`.
   */
  formMode?: BookingFormMode;
  /** Controlled selection: the offer the application owns. */
  selection?: BookingSelection;
  /** Uncontrolled initial selection, verified against availability before use. */
  defaultSelection?: BookingSelection;
  /** Called whenever the selection changes, however it changed. */
  onSelectionChange?: (selection: BookingSelection, metadata: BookingChangeMetadata) => void;
  /** Duration options in minutes. Default: `[15, 30, 60]`. */
  durations?: number[];
  /** Controlled duration, in minutes. */
  duration?: number;
  /** Uncontrolled initial duration. Default: first entry of `durations`. */
  defaultDuration?: number;
  /** Called whenever the duration changes, however it changed. */
  onDurationChange?: (duration: number, metadata: BookingChangeMetadata) => void;
  /** IANA time zone used for every date and time rendered. Default: the browser zone. */
  /** IANA time zone used for every date and time rendered, and for calendar queries. */
  timeZone?: string;
  /** Uncontrolled initial time zone. Default: the browser zone. */
  defaultTimeZone?: string;
  /** Built-in locale (`en`, `ru`) or any tag understood by `Intl`. Default: browser. */
  locale?: BuiltInLocale | (string & {});
  /** Per-string overrides merged on top of the locale defaults. */
  messages?: Partial<SlotlineMessages>;
  /** `dark` (default), `light`, or `system` to follow the OS. */
  theme?: SlotlineTheme;
  /** Header title override. */
  title?: string;
  /** Earliest selectable day, `YYYY-MM-DD` or `Date`. Default: today. */
  minDate?: string | Date;
  /** Latest selectable day, `YYYY-MM-DD` or `Date`. Default: today. */
  maxDate?: string | Date;
  /** First column of the calendar. `0` = Sunday (default), `1` = Monday. */
  weekStartsOn?: 0 | 1;
  /** `24h` (default) or a 12-hour cycle. */
  timeFormat?: TimeFormat;
  /** Uncontrolled initial hour cycle. */
  defaultTimeFormat?: TimeFormat;
  /** Called when the hour cycle changes. */
  onTimeFormatChange?: (timeFormat: TimeFormat, metadata: BookingChangeMetadata) => void;
  /** The schedule the widget works against. Default: a single implicit one. */
  context?: BookingContext;
  /** Called when the schedule changes. */
  onContextChange?: (context: BookingContext, metadata: BookingChangeMetadata) => void;
  /**
   * An attempt the application restored after a reload. It opens on the attempt
   * screen, resolved, so nothing is repeated by accident.
   */
  attempt?: InitialBookingAttempt | null;
  /** Asks the application to look up the outcome of an unresolved attempt. */
  onCheckStatus?: () => void;
  /**
   * Called after the adapter persisted the booking — even when the user has
   * already moved on, in which case the UI does not jump to the confirmation. An
   * exception thrown here never turns a created booking into a failure.
   */
  onBooked?: (result: BookingResult, request: BookingRequest<TValues>) => void;
  /** Called on any adapter failure, with the phase it happened in. */
  onError?: (error: BookingError, context: BookingErrorContext) => void;
  /** Renders a back button on the first step that calls this instead of leaving it out. */
  onDismiss?: () => void;
  /** Extra class on the outermost element. */
  className?: string;
  /** Per-slot class overrides. */
  classNames?: Partial<Record<SlotlineClassSlot, string>>;
  /** Move focus into the widget on mount. Default: `false` — set it in modal contexts. */
  autoFocus?: boolean;
  /** Trap `Tab` inside the card and let `Escape` go back. Default: `false` (inline widgets should not trap focus). */
  trapFocus?: boolean;
  /** Replace the built-in animation kit (see `@nickkupriyanov/slotline-react/motion`). */
  animations?: AnimationKit;
}

export type SlotlineProviderProps<TValues = DefaultBookingValues> = SlotlineProps<TValues> & {
  children: ReactNode;
};

/* -------------------------------------------------------------------------- */
/*  Animation kit                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Animation primitives the widget renders through. The default kit is pure CSS;
 * `@nickkupriyanov/slotline-react/motion` swaps in spring-based variants.
 */
export interface AnimationKit {
  /** Rendered once and kept mounted; animates its child on every `stepKey` change. */
  StepHost: (props: StepHostProps) => ReactNode;
  /** A `<button>` that joins a stagger group; used for the time slots. */
  Item: (props: StaggerItemProps) => ReactNode;
  /** Animated container used by the panel to follow its content height. */
  Height: (props: HeightProps) => ReactNode;
}

export interface StepHostProps {
  stepKey: string;
  direction: 1 | -1;
  className?: string;
  children: ReactNode;
}

export interface StaggerItemProps extends ComponentPropsWithoutRef<'button'> {
  /** Position inside the group; drives the delay. */
  index: number;
}

export interface HeightProps {
  className?: string;
  children: ReactNode;
}
