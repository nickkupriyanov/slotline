// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeAnimatedHeight, type AnimatedHeightState } from './height';

function rectOf(height: number): DOMRect {
  return {
    width: 400,
    height,
    top: 0,
    left: 0,
    right: 400,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function elementWithHeight(read: () => number): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => rectOf(read());
  return element;
}

let trigger: (() => void) | null = null;

class FakeResizeObserver {
  constructor(callback: () => void) {
    trigger = callback;
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  trigger = null;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('animated height', () => {
  it('reports the first measurement without animating', () => {
    const states: AnimatedHeightState[] = [];

    observeAnimatedHeight(
      elementWithHeight(() => 100),
      {
        durationMs: 200,
        onChange: (state) => states.push(state),
      },
    );

    expect(states).toEqual([{ height: 100, animating: false }]);
  });

  it('animates a change and settles afterwards', () => {
    let height = 100;
    const states: AnimatedHeightState[] = [];

    observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        durationMs: 200,
        onChange: (state) => states.push(state),
      },
    );

    height = 160;
    trigger?.();
    expect(states.at(-1)).toEqual({ height: 160, animating: true });

    vi.advanceTimersByTime(200);
    expect(states.at(-1)).toEqual({ height: 160, animating: false });
  });

  it('ignores a change too small to be worth a transition', () => {
    let height = 100;
    const states: AnimatedHeightState[] = [];

    observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        durationMs: 200,
        onChange: (state) => states.push(state),
      },
    );

    height = 100.4;
    trigger?.();
    expect(states.at(-1)).toEqual({ height: 100.4, animating: false });
  });

  it('observes nothing when disabled — how reduced motion is honoured', () => {
    const states: AnimatedHeightState[] = [];

    const stop = observeAnimatedHeight(
      elementWithHeight(() => 100),
      {
        disabled: true,
        onChange: (state) => states.push(state),
      },
    );

    expect(states).toEqual([{ height: undefined, animating: false }]);
    expect(trigger).toBeNull();
    expect(() => stop()).not.toThrow();
  });

  it('drops a pending settle when it is removed', () => {
    let height = 100;
    const states: AnimatedHeightState[] = [];

    const stop = observeAnimatedHeight(
      elementWithHeight(() => height),
      {
        durationMs: 200,
        onChange: (state) => states.push(state),
      },
    );

    height = 160;
    trigger?.();
    const reported = states.length;

    stop();
    vi.advanceTimersByTime(500);
    expect(states.length).toBe(reported);
  });
});
