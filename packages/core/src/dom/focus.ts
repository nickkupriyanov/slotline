/**
 * Keyboard focus.
 *
 * The trap is deliberately not a modal one: it keeps `Tab` inside the container
 * but never stops the rest of the page from receiving focus programmatically.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The elements inside `container` that can actually take focus right now: a
 * candidate either has a layout box, or is the focused element, or is explicitly
 * tabbable.
 */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.offsetParent !== null || element === document.activeElement || element.tabIndex >= 0,
  );
}

export interface TrapFocusOptions {
  /** Called on `Escape`. Omit it to leave the key for the page. */
  onEscape?: () => void;
}

/**
 * Keeps `Tab` (and `Shift+Tab`) cycling inside `container`, and routes `Escape`
 * when a handler is given. Returns the remover.
 */
export function trapFocus(container: HTMLElement, options: TrapFocusOptions = {}): () => void {
  const { onEscape } = options;

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

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
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
}
