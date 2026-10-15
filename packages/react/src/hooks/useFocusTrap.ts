import { useEffect } from 'react';
import { trapFocus } from '@nickkupriyanov/slotline-core/dom';

export interface UseFocusTrapOptions {
  active: boolean;
  /** Called on `Escape`. */
  onEscape?: () => void;
}

/**
 * Keeps `Tab` inside the widget while it is mounted and optionally routes
 * `Escape` to the consumer. The trap itself is framework-free
 * (`@nickkupriyanov/slotline-core/dom`); this hook only ties it to the lifecycle.
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  { active, onEscape }: UseFocusTrapOptions,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;
    return trapFocus(container, onEscape ? { onEscape } : {});
  }, [active, containerRef, onEscape]);
}
