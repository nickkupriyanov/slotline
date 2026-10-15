import { useEffect, useRef, useState } from 'react';
import { observeAnimatedHeight, type AnimatedHeightState } from '@nickkupriyanov/slotline-core/dom';
import { useReducedMotion } from './useMediaQuery';

export interface UseAnimatedHeightResult<T extends HTMLElement> {
  /** Attach to the inner element whose natural height should be followed. */
  contentRef: React.RefObject<T | null>;
  /** Inline style for the clipping wrapper (`undefined` disables animation). */
  style: React.CSSProperties | undefined;
  /** `true` while the wrapper animates — lets CSS disable clipping afterwards. */
  animating: boolean;
}

/**
 * Follows the height of `contentRef` and animates the wrapper between values.
 *
 * Content is clipped *only* while animating, so focus rings and shadows are
 * never cut off at rest — the detail that usually makes this trick look cheap.
 * Under `prefers-reduced-motion: reduce` the wrapper keeps its natural height.
 *
 * The measurement and the timing belong to `@nickkupriyanov/slotline-core/dom`;
 * what stays here is the ref, the state and the inline style.
 */
export function useAnimatedHeight<T extends HTMLElement>(
  durationMs = 320,
): UseAnimatedHeightResult<T> {
  const contentRef = useRef<T | null>(null);
  const [state, setState] = useState<AnimatedHeightState>({
    height: undefined,
    animating: false,
  });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const element = contentRef.current;
    if (!element || reducedMotion) return;
    return observeAnimatedHeight(element, { durationMs, onChange: setState });
  }, [durationMs, reducedMotion]);

  if (reducedMotion) {
    return { contentRef, style: undefined, animating: false };
  }

  const style: React.CSSProperties | undefined =
    state.height === undefined
      ? undefined
      : {
          height: state.height,
          overflow: state.animating ? 'hidden' : 'visible',
          transition: `height ${durationMs}ms var(--sl-ease-soft)`,
        };

  return { contentRef, style, animating: state.animating };
}
