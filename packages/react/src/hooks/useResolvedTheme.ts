import { useEffect, useState } from 'react';
import type { SlotlineTheme } from '../types';

/**
 * Resolves `system` to a concrete theme and keeps it in sync with the OS.
 * The widget exposes the result as `data-sl-theme`, so the stylesheet only
 * needs two token blocks.
 */
export function useResolvedTheme(theme: SlotlineTheme): 'dark' | 'light' {
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [theme]);

  if (theme === 'system') return systemTheme;
  return theme;
}
