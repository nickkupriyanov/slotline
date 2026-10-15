import { useEffect, useState } from 'react';
import { REDUCED_MOTION_QUERY, observeMediaQuery } from '@nickkupriyanov/slotline-core/dom';

/** Tracks any media query, SSR-safe. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  // The watcher reports the current value immediately, so nothing is missed
  // between the first render and the effect.
  useEffect(() => observeMediaQuery(query, setMatches), [query]);

  return matches;
}

/** `true` when the user asked the OS to reduce motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
