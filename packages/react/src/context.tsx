import { createContext, useCallback, useContext, useMemo } from 'react';
import {
  SLOT_CLASS,
  cx,
  defaultMessages,
  type BookingControllerActions,
  type BookingSnapshot,
  type ClassValue,
  type SlotlineMessages,
} from '@nickkupriyanov/slotline-core';
import { cssAnimations } from './animations/css';
import { DEFAULT_COMPONENTS, type SlotlineComponents } from './parts';
import type { AnimationKit, SlotlineClassSlot, SlotlineTheme } from './types';

/* -------------------------------------------------------------------------- */
/*  Flow context                                                               */
/* -------------------------------------------------------------------------- */

/** What the flow hands to a binding: one immutable snapshot and the actions. */
export interface UseBookingFlowResult {
  snapshot: BookingSnapshot;
  actions: BookingControllerActions;
}

export const FlowContext = createContext<UseBookingFlowResult | null>(null);

/**
 * Reads the booking flow from the nearest `<Slotline>` / `<SlotlineProvider>`.
 * This is the hook to build a fully custom UI on top of.
 */
export function useSlotlineContext(): UseBookingFlowResult {
  const flow = useContext(FlowContext);
  if (!flow) {
    throw new Error(
      '[slotline] useSlotlineContext() must be used inside <Slotline> or <SlotlineProvider>.',
    );
  }
  return flow;
}

/** Internal short alias used by the built-in components. */
export const useFlow = useSlotlineContext;

/* -------------------------------------------------------------------------- */
/*  UI context                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Presentation values shared by the built-in parts. Copy and locale live here
 * rather than in the view model: they are how the application asked the widget to
 * speak, not something derived from the flow.
 */
export interface SlotlineUIContextValue {
  animations: AnimationKit;
  classNames?: Partial<Record<SlotlineClassSlot, string>>;
  className?: string;
  autoFocus: boolean;
  trapFocus: boolean;
  /** Whether the application supplied a dismiss handler. */
  canDismiss: boolean;
  /** Asks the application to look up the outcome of an unresolved attempt. */
  onCheckStatus?: (() => void) | undefined;
  messages: SlotlineMessages;
  locale: string;
  theme: Exclude<SlotlineTheme, 'system'>;
  /** Parts the application replaced; anything absent falls back to the default. */
  components?: SlotlineComponents;
}

export const UIContext = createContext<SlotlineUIContextValue>({
  animations: cssAnimations,
  autoFocus: false,
  trapFocus: false,
  canDismiss: false,
  messages: defaultMessages.en,
  locale: 'en',
  theme: 'dark',
});

export function useUI(): SlotlineUIContextValue {
  return useContext(UIContext);
}

/**
 * The parts this widget renders, with the defaults filled in.
 *
 * A replacement is per part and independent of `classNames`: a custom slot keeps
 * the library's classes unless it chooses otherwise.
 */
export function useComponents(): Required<SlotlineComponents> {
  const { components } = useContext(UIContext);
  return useMemo(() => ({ ...DEFAULT_COMPONENTS, ...components }), [components]);
}

export function useAnimations(): AnimationKit {
  return useContext(UIContext).animations;
}

/** `classes('day', isToday && 'is-today')` → `"sl-day is-today <consumer class>"`. */
export function useClassNames(): (slot: SlotlineClassSlot, ...extra: ClassValue[]) => string {
  const { classNames } = useUI();
  return useCallback(
    (slot: SlotlineClassSlot, ...extra: ClassValue[]) =>
      cx(SLOT_CLASS[slot], classNames?.[slot], ...extra),
    [classNames],
  );
}
