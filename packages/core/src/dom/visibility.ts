/**
 * Page visibility.
 *
 * A tab that comes back may have slept through a day boundary, or through the end
 * of a window the flow cares about, so whoever owns the clock listens here.
 */

/** Calls back when the document becomes visible again. Returns the remover. */
export function observeVisibilityChange(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = () => {
    if (document.visibilityState === 'visible') listener();
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
