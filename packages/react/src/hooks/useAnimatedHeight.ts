import { useCallback, useEffect, useRef, useState } from 'react';
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
 */
export function useAnimatedHeight<T extends HTMLElement>(
  durationMs = 320,
): UseAnimatedHeightResult<T> {
  const contentRef = useRef<T | null>(null);
  const heightRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [height, setHeight] = useState<number>();
  const [animating, setAnimating] = useState(false);
  const reducedMotion = useReducedMotion();

  const measure = useCallback(() => {
    const element = contentRef.current;
    if (!element) return;
    const next = element.getBoundingClientRect().height;
    if (!(next > 0)) return;

    const previous = heightRef.current;
    if (previous !== undefined && Math.abs(previous - next) >= 1) {
      setAnimating(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAnimating(false), durationMs);
    }
    heightRef.current = next;
    setHeight((current) => (current === next ? current : next));
  }, [durationMs]);

  useEffect(() => {
    if (reducedMotion) return;
    measure();

    const element = contentRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, reducedMotion]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (reducedMotion) {
    return { contentRef, style: undefined, animating: false };
  }

  const style: React.CSSProperties | undefined =
    height === undefined
      ? undefined
      : {
          height,
          overflow: animating ? 'hidden' : 'visible',
          transition: `height ${durationMs}ms var(--sl-ease-soft)`,
        };

  return { contentRef, style, animating };
}
