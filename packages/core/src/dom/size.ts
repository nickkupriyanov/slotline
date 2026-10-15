/**
 * Element size.
 *
 * `ResizeObserver` where it exists, a window resize listener where it does not,
 * and a plain measurement where there is no window at all.
 */

export interface ElementSize {
  width: number;
  height: number;
}

/** The border-box size of an element, or a zero size when it cannot be read. */
export function measureSize(element: Element | null | undefined): ElementSize {
  if (!element) return { width: 0, height: 0 };
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/** The border-box height of an element; `0` when it cannot be read. */
export function measureHeight(element: Element | null | undefined): number {
  return measureSize(element).height;
}

/**
 * Reports an element's size now and whenever it changes. Returns the remover.
 *
 * With no `ResizeObserver` the window's own resize event is used, which is what
 * the layout of an inline widget actually follows in practice.
 */
export function observeSize(element: Element, listener: (size: ElementSize) => void): () => void {
  const read = () => listener(measureSize(element));
  read();

  if (typeof ResizeObserver === 'undefined') {
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }

  const observer = new ResizeObserver(read);
  observer.observe(element);
  return () => observer.disconnect();
}
