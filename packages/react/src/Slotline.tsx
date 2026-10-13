import { useMemo } from 'react';
import { cssAnimations } from './animations/css';
import { SlotlineView } from './components/SlotlineView';
import { FlowContext, UIContext, type SlotlineUIContextValue } from './context';
import { useBookingFlow } from './useBookingFlow';
import type { AnimationKit, SlotlineProps, SlotlineProviderProps } from './types';

/**
 * Provides the booking flow to any UI. Use it directly to build a custom
 * widget on top of `useSlotlineContext()`.
 */
export function SlotlineProvider(props: SlotlineProviderProps) {
  const { children } = props;
  const flow = useBookingFlow(props);

  const ui = useMemo<SlotlineUIContextValue>(
    () => ({
      animations: props.animations ?? cssAnimations,
      classNames: props.classNames,
      autoFocus: props.autoFocus ?? false,
      trapFocus: props.trapFocus ?? false,
      className: props.className,
    }),
    [
      props.animations,
      props.classNames,
      props.autoFocus,
      props.trapFocus,
      props.className,
    ],
  );

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
  function ComposedSlotline(props: SlotlineProps) {
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
