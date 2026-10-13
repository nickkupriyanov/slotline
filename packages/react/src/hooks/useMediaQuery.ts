import { useEffect, useState } from 'react';

function subscribe(query: string, listener: (matches: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(query);
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  listener(list.matches);
  list.addEventListener('change', handler);
  return () => list.removeEventListener('change', handler);
}

/** Tracks any media query, SSR-safe. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribe(query, (next) => {
      if (active) setMatches(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [query]);

  return matches;
}

/** `true` when the user asked the OS to reduce motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
