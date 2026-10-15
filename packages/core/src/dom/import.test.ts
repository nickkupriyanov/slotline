/**
 * Deliberately without a `@vitest-environment jsdom` docblock: this file runs in
 * node, which is the environment a server renders in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dom from './index';

type TrapName = 'window' | 'document';

function trapHostAccess(): void {
  for (const name of ['window', 'document'] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new Error(`the DOM entry point read ${name} while it was being imported`);
      },
    });
  }
}

function releaseHostAccess(): void {
  for (const name of ['window', 'document'] as const) {
    // `delete` on a global that only the trap defined leaves the environment as
    // it was.
    delete (globalThis as Record<string, unknown>)[name as TrapName];
  }
}

afterEach(() => {
  releaseHostAccess();
  vi.resetModules();
});

describe('importing the DOM entry point', () => {
  it('reads neither window nor document, so a server can load it', async () => {
    trapHostAccess();
    vi.resetModules();

    await expect(import('./index')).resolves.toBeDefined();
  });

  it('degrades to doing nothing when there is no host to observe', () => {
    const seen: boolean[] = [];
    const stopMedia = dom.observeMediaQuery('(prefers-reduced-motion: reduce)', (matches) =>
      seen.push(matches),
    );

    expect(seen).toEqual([false]);
    expect(dom.canMatchMedia()).toBe(false);
    expect(dom.matchesMediaQuery('(prefers-reduced-motion: reduce)')).toBe(false);
    expect(() => stopMedia()).not.toThrow();

    expect(dom.measureSize(null)).toEqual({ width: 0, height: 0 });
    expect(dom.measureHeight(undefined)).toBe(0);

    const element = {
      getBoundingClientRect: () => ({ width: 10, height: 20 }),
    } as unknown as Element;
    const sizes: number[] = [];
    const stopSize = dom.observeSize(element, (size) => sizes.push(size.height));
    expect(sizes).toEqual([20]);
    expect(() => stopSize()).not.toThrow();

    const stopVisibility = dom.observeVisibilityChange(() => {});
    expect(() => stopVisibility()).not.toThrow();
  });
});
