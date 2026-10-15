import { useEffect, useState } from 'react';
import {
  DARK_SCHEME_QUERY,
  canMatchMedia,
  matchesMediaQuery,
  observeMediaQuery,
} from '@nickkupriyanov/slotline-core/dom';
import type { SlotlineTheme } from '../types';

/** What the host says, defaulting to the widget's own dark theme. */
function hostTheme(): 'dark' | 'light' {
  if (!canMatchMedia()) return 'dark';
  return matchesMediaQuery(DARK_SCHEME_QUERY) ? 'dark' : 'light';
}

/**
 * Resolves `system` to a concrete theme and keeps it in sync with the OS.
 * The widget exposes the result as `data-sl-theme`, so the stylesheet only
 * needs two token blocks.
 */
export function useResolvedTheme(theme: SlotlineTheme): 'dark' | 'light' {
  const [resolved, setResolved] = useState(hostTheme);

  useEffect(() => {
    if (theme !== 'system') return;
    return observeMediaQuery(DARK_SCHEME_QUERY, (matches) =>
      setResolved(matches ? 'dark' : 'light'),
    );
  }, [theme]);

  return theme === 'system' ? resolved : theme;
}
