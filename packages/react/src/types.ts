import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type {
  BookingAdapter,
  BookingRequest,
  BookingResult,
  BuiltInLocale,
  SlotlineClassSlot,
  SlotlineMessages,
  SlotlineTheme,
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

export interface SlotlineProps {
  /** Availability + booking persistence. See {@link BookingAdapter}. */
  adapter: BookingAdapter;
  /** Duration options in minutes. Default: `[15, 30, 60]`. */
  durations?: number[];
  /** Controlled duration, in minutes. */
  duration?: number;
  /** Uncontrolled initial duration. Default: first entry of `durations`. */
  defaultDuration?: number;
  /** Called whenever the user picks a different duration. */
  onDurationChange?: (duration: number) => void;
  /** IANA time zone used for every date and time rendered. Default: the browser zone. */
  timeZone?: string;
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
  /**
   * Called after the adapter persisted the booking — even when the user has
   * already moved on, in which case the UI does not jump to the confirmation.
   */
  onBooked?: (result: BookingResult, request: BookingRequest) => void;
  /** Called on any adapter failure; the widget also renders the message inline. */
  onError?: (error: Error) => void;
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

export interface SlotlineProviderProps extends SlotlineProps {
  children: ReactNode;
}

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
