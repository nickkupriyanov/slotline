// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureHeight, measureSize, observeSize } from './size';

function rectOf(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function elementWithHeight(read: () => number): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => rectOf(400, read());
  return element;
}

/**
 * Declared at module scope on purpose: a class declared inside a test would let
 * the compiler narrow the captured `trigger` to its initial `null`.
 */
let trigger: (() => void) | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    trigger = callback;
  }
  observe(element: Element) {
    observed.push(element);
  }
  disconnect() {
    disconnected = true;
  }
}

const observed: Element[] = [];
let disconnected = false;

/** Reads `trigger` through a function so the tests' own assignments do not narrow it. */
function fireResize(): void {
  trigger?.();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('element size', () => {
  it('reports a zero size for nothing at all', () => {
    expect(measureSize(null)).toEqual({ width: 0, height: 0 });
    expect(measureHeight(undefined)).toBe(0);
  });

  it('measures the border box', () => {
    const element = elementWithHeight(() => 120);

    expect(measureHeight(element)).toBe(120);
    expect(measureSize(element)).toEqual({ width: 400, height: 120 });
  });

  it('falls back to the window resize without a ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    let height = 100;
    const element = elementWithHeight(() => height);
    const seen: number[] = [];

    const stop = observeSize(element, (size) => seen.push(size.height));
    expect(seen).toEqual([100]);

    height = 150;
    window.dispatchEvent(new Event('resize'));
    expect(seen).toEqual([100, 150]);

    stop();
    height = 200;
    window.dispatchEvent(new Event('resize'));
    expect(seen).toEqual([100, 150]);
  });

  it('uses a ResizeObserver when the host has one, and disconnects it', () => {
    observed.length = 0;
    disconnected = false;
    trigger = null;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    const element = elementWithHeight(() => 80);
    const seen: number[] = [];
    const stop = observeSize(element, (size) => seen.push(size.height));

    expect(observed).toEqual([element]);
    expect(seen).toEqual([80]);

    fireResize();
    expect(seen).toEqual([80, 80]);

    stop();
    expect(disconnected).toBe(true);
  });
});
