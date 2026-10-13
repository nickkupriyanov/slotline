import { createContext, useCallback, useContext } from 'react';
import { cssAnimations } from './animations/css';
import { SLOT_CLASS, cx, type ClassValue } from '@nickkupriyanov/slotline-core';
import type { UseBookingFlowResult } from './useBookingFlow';
import type { AnimationKit, SlotlineClassSlot } from './types';

/* -------------------------------------------------------------------------- */
/*  Flow context                                                               */
/* -------------------------------------------------------------------------- */

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

export interface SlotlineUIContextValue {
  animations: AnimationKit;
  classNames?: Partial<Record<SlotlineClassSlot, string>>;
  autoFocus: boolean;
  trapFocus: boolean;
  className?: string;
}

export const UIContext = createContext<SlotlineUIContextValue>({
  animations: cssAnimations,
  autoFocus: false,
  trapFocus: false,
});

export function useUI(): SlotlineUIContextValue {
  return useContext(UIContext);
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
