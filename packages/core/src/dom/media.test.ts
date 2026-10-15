// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DARK_SCHEME_QUERY,
  REDUCED_MOTION_QUERY,
  canMatchMedia,
  matchesMediaQuery,
  observeMediaQuery,
} from './media';

function stubMatchMedia(initial: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const state = { matches: initial };
  const list = {
    get matches() {
      return state.matches;
    },
    addEventListener(_type: string, handler: (event: { matches: boolean }) => void) {
      listeners.add(handler);
    },
    removeEventListener(_type: string, handler: (event: { matches: boolean }) => void) {
      listeners.delete(handler);
    },
  };

  vi.stubGlobal('matchMedia', () => list as unknown as MediaQueryList);

  return {
    change(next: boolean) {
      state.matches = next;
      for (const listener of [...listeners]) listener({ matches: next });
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('media queries', () => {
  it('admits when the host cannot answer queries at all', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(canMatchMedia()).toBe(false);
    expect(matchesMediaQuery(DARK_SCHEME_QUERY)).toBe(false);
  });

  it('reads a query without waiting', () => {
    stubMatchMedia(true);

    expect(canMatchMedia()).toBe(true);
    expect(matchesMediaQuery(DARK_SCHEME_QUERY)).toBe(true);
  });

  it('tells the listener the current value, then every change', () => {
    const media = stubMatchMedia(false);
    const seen: boolean[] = [];

    const stop = observeMediaQuery(DARK_SCHEME_QUERY, (matches) => seen.push(matches));
    expect(seen).toEqual([false]);

    media.change(true);
    expect(seen).toEqual([false, true]);

    stop();
    expect(media.listenerCount()).toBe(0);
  });

  it('reports once and watches nothing without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const seen: boolean[] = [];

    const stop = observeMediaQuery(REDUCED_MOTION_QUERY, (matches) => seen.push(matches));

    expect(seen).toEqual([false]);
    expect(() => stop()).not.toThrow();
  });
});
