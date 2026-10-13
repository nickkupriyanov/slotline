/**
 * @nickkupriyanov/slotline-react/motion — the same widget with spring-based transitions.
 *
 * ```tsx
 * import { Slotline } from '@nickkupriyanov/slotline-react/motion';
 * import '@nickkupriyanov/slotline-react/styles.css';
 * ```
 *
 * Requires the optional `motion` peer dependency.
 */
import { motionAnimations } from './animations/motion';
import { createSlotline } from './Slotline';

export * from './public';
export { motionAnimations };

/** Identical API to the default `Slotline`, with `motion` driving the transitions. */
export const Slotline = createSlotline(motionAnimations);
