/**
 * Animated height.
 *
 * The decision — what the new height is, and whether the change is worth
 * animating — is the same everywhere; only the style that carries it out belongs
 * to a binding.
 */
import { measureHeight, observeSize } from './size';

export interface AnimatedHeightState {
  /** The height to render, or `undefined` before the first measurement. */
  height: number | undefined;
  /** `true` while the height is changing: the moment a binding clips content. */
  animating: boolean;
}

export interface ObserveAnimatedHeightOptions {
  /** How long the transition runs. Default: `320`. */
  durationMs?: number;
  /** Receives every new state. */
  onChange(state: AnimatedHeightState): void;
  /** Ignores changes entirely — used under `prefers-reduced-motion`. */
  disabled?: boolean;
}

const DEFAULT_DURATION_MS = 320;
/** Sub-pixel differences are not worth a transition. */
const MIN_CHANGE_PX = 1;

/**
 * Follows an element's height and reports it together with the `animating` flag.
 * Returns the remover.
 *
 * A first measurement never animates: there is no previous height to move from.
 */
export function observeAnimatedHeight(
  element: Element,
  options: ObserveAnimatedHeightOptions,
): () => void {
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
  let previous: number | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;

  if (options.disabled) {
    options.onChange({ height: undefined, animating: false });
    return () => {};
  }

  const stop = observeSize(element, () => {
    const next = measureHeight(element);
    if (!(next > 0)) return;

    let animating = false;
    if (previous !== undefined && Math.abs(previous - next) >= MIN_CHANGE_PX) {
      animating = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        options.onChange({ height: previous, animating: false });
      }, durationMs);
    }
    previous = next;
    options.onChange({ height: next, animating });
  });

  return () => {
    stop();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
