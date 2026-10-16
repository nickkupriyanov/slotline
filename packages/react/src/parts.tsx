import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type {
  BookingAttemptView,
  BookingConfirmationView,
  BookingDayView,
  BookingDurationView,
  BookingFormView,
  BookingProgressView,
  BookingSlotView,
  BookingView,
  SlotlineMessages,
} from '@nickkupriyanov/slotline-core';

/**
 * The extension points of the widget.
 *
 * Every part receives the data it renders and the actions it triggers — nothing
 * else. The library keeps the behaviour that must not be re-implemented (focus,
 * keyboard navigation, the flow itself) and hands a part only the contract it
 * cannot get wrong: a slot gets prepared button props, a day gets its content
 * swapped inside the standard interactive shell.
 */

export interface BackAffordance {
  label: string;
  disabled: boolean;
  onClick(): void;
}

export interface HeaderPartProps {
  title: string;
  durationLabel: string;
  /** `null` when going back is not meaningful on this step. */
  back: BackAffordance | null;
  /** The progress bar, already rendered by the library. */
  children: ReactNode;
}

export interface ProgressPartProps {
  progress: BookingProgressView;
}

/** The content of one day, inside the library's own button. */
export interface DayContentPartProps {
  day: string;
  /** Absent for the padding days that complete the first and last week. */
  dayView?: BookingDayView | undefined;
}

export interface SlotPartProps {
  slot: BookingSlotView;
  /** Position in the group: the CSS stagger reads it from `--sl-index`. */
  index: number;
  /**
   * Spread these on your own element: they carry the pick handler, the selection
   * state, the accessible name and the animation hook.
   */
  slotProps: ComponentPropsWithoutRef<'button'>;
  /** The formatted label. */
  children: ReactNode;
}

export interface FormPartProps {
  form: BookingFormView;
  messages: SlotlineMessages;
  actions: {
    setValues(values: Record<string, unknown>): void;
    touchField(field: string): void;
    submit(): void | Promise<void>;
    /** Loads the offers of the selected day again after a failure. */
    retry(): void;
  };
}

export interface SummaryPartProps {
  view: BookingView;
}

export interface AttemptPartProps {
  attempt: BookingAttemptView;
  actions: {
    retry(): void;
    checkStatus?: (() => void) | undefined;
  };
}

export interface ConfirmationPartProps {
  confirmation: BookingConfirmationView;
  actions: {
    reset(): void;
  };
}

export interface DurationFooterPartProps {
  duration: BookingDurationView;
  /** The controller's own action: a part never holds the duration itself. */
  onSelect(minutes: number): void;
}

export interface LoadingPartProps {
  /** How many placeholders to draw. Default: `9`. */
  count?: number;
}

export interface ErrorPartProps {
  message: string;
  retryLabel: string;
  onRetry?: (() => void) | undefined;
}

export interface EmptyPartProps {
  title: string;
  body: string;
  action?: { label: string; onClick(): void } | undefined;
}

/** A part is a component, or a function returning nodes — whatever fits the call site. */
export type PartComponent<Props> = (props: Props) => ReactNode;

export interface SlotlineComponents {
  Header?: PartComponent<HeaderPartProps>;
  Progress?: PartComponent<ProgressPartProps>;
  DayContent?: PartComponent<DayContentPartProps>;
  Slot?: PartComponent<SlotPartProps>;
  Form?: PartComponent<FormPartProps>;
  Summary?: PartComponent<SummaryPartProps>;
  Attempt?: PartComponent<AttemptPartProps>;
  Confirmation?: PartComponent<ConfirmationPartProps>;
  DurationFooter?: PartComponent<DurationFooterPartProps>;
  Loading?: PartComponent<LoadingPartProps>;
  Error?: PartComponent<ErrorPartProps>;
  Empty?: PartComponent<EmptyPartProps>;
}

/* Every default, so an application can wrap rather than re-implement. */
import { AttemptStep as DefaultAttempt } from './components/AttemptStep';
import {
  DayContent as DefaultDayContent,
  EmptyBlock as DefaultEmpty,
  ErrorBlock as DefaultError,
  Header as DefaultHeader,
  LoadingBlock as DefaultLoading,
  SlotButton as DefaultSlot,
} from './components/blocks';
import { ConfirmedStep as DefaultConfirmation } from './components/ConfirmedStep';
import { DurationFooter as DefaultDurationFooter } from './components/DurationFooter';
import { Form as DefaultForm } from './components/Form';
import { Progress as DefaultProgress } from './components/Progress';
import { Summary as DefaultSummary } from './components/Summary';

export {
  DefaultAttempt,
  DefaultConfirmation,
  DefaultDayContent,
  DefaultDurationFooter,
  DefaultEmpty,
  DefaultError,
  DefaultForm,
  DefaultHeader,
  DefaultLoading,
  DefaultProgress,
  DefaultSlot,
  DefaultSummary,
};

/** What the widget renders when the application replaces nothing. */
export const DEFAULT_COMPONENTS: Required<SlotlineComponents> = {
  Header: DefaultHeader,
  Progress: DefaultProgress,
  DayContent: DefaultDayContent,
  Slot: DefaultSlot,
  Form: DefaultForm,
  Summary: DefaultSummary,
  Attempt: DefaultAttempt,
  Confirmation: DefaultConfirmation,
  DurationFooter: DefaultDurationFooter,
  Loading: DefaultLoading,
  Error: DefaultError,
  Empty: DefaultEmpty,
};
