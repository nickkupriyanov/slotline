/**
 * Media queries, without a framework.
 *
 * Nothing here touches `window` until a function is called, so importing the
 * module is safe on a server.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** Whether the host can answer media queries at all. */
export function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/** The current value of a query; `false` where it cannot be read. */
export function matchesMediaQuery(query: string): boolean {
  if (!canMatchMedia()) return false;
  return window.matchMedia(query).matches;
}

/**
 * Reports a query's value now and on every change. Returns the remover.
 *
 * Without `matchMedia` — an old browser, a test environment, the server — the
 * listener is told `false` once, and nothing is watched.
 */
export function observeMediaQuery(query: string, listener: (matches: boolean) => void): () => void {
  if (!canMatchMedia()) {
    listener(false);
    return () => {};
  }

  const list = window.matchMedia(query);
  const handler = (event: MediaQueryListEvent) => listener(event.matches);
  listener(list.matches);
  list.addEventListener('change', handler);
  return () => list.removeEventListener('change', handler);
}
