import { cssAnimations } from './animations/css';
import { SlotlineView } from './components/SlotlineView';
import { FlowContext, UIContext } from './context';
import { useBookingController, useSlotlineUI } from './useBookingFlow';
import { useMemo, useSyncExternalStore } from 'react';
import type { DefaultBookingValues } from '@nickkupriyanov/slotline-core';
import type { AnimationKit, SlotlineProps, SlotlineProviderProps } from './types';

/**
 * Provides the booking flow to any UI. Use it directly to build a custom widget
 * on top of `useSlotlineContext()`.
 *
 * The provider owns exactly one controller: it is created here, kept in step with
 * the props, started after mounting and stopped on unmount.
 */
export function SlotlineProvider<TValues = DefaultBookingValues>(
  props: SlotlineProviderProps<TValues>,
) {
  const { children } = props;
  const controller = useBookingController(props);
  const ui = useSlotlineUI(props);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const flow = useMemo(() => ({ snapshot, actions: controller.actions }), [snapshot, controller]);

  return (
    <FlowContext.Provider value={flow}>
      <UIContext.Provider value={ui}>{children}</UIContext.Provider>
    </FlowContext.Provider>
  );
}

/**
 * Builds a `Slotline` bound to a specific animation kit — used by
 * `@nickkupriyanov/slotline-react/motion` and available for custom kits.
 */
export function createSlotline(animations: AnimationKit) {
  function ComposedSlotline<TValues = DefaultBookingValues>(props: SlotlineProps<TValues>) {
    return (
      <SlotlineProvider {...props} animations={props.animations ?? animations}>
        <SlotlineView />
      </SlotlineProvider>
    );
  }
  ComposedSlotline.displayName = 'Slotline';
  return ComposedSlotline;
}

/**
 * The ready-made widget: calendar → slots → details → confirmation.
 *
 * ```tsx
 * import { Slotline } from '@nickkupriyanov/slotline-react';
 * import '@nickkupriyanov/slotline-react/styles.css';
 *
 * <Slotline adapter={adapter} theme="dark" locale="ru" />
 * ```
 */
export const Slotline = createSlotline(cssAnimations);
