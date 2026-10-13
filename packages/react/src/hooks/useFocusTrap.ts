import { useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      element.offsetParent !== null || element === document.activeElement || element.tabIndex >= 0,
  );
}

export interface UseFocusTrapOptions {
  active: boolean;
  /** Called on `Escape`. */
  onEscape?: () => void;
}

/**
 * Keeps `Tab` inside the widget while it is mounted and optionally routes
 * `Escape` to the consumer. Deliberately not a modal trap: it never blocks the
 * rest of the page from receiving focus programmatically.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  { active, onEscape }: UseFocusTrapOptions,
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (!activeElement || !container.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef, onEscape]);
}
