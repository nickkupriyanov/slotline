// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusableWithin, trapFocus } from './focus';

function buildContainer(count = 2) {
  const container = document.createElement('div');
  const buttons = Array.from({ length: count }, (_, index) => {
    const button = document.createElement('button');
    button.textContent = `button ${index}`;
    container.appendChild(button);
    return button;
  });
  document.body.appendChild(container);
  return { container, buttons };
}

function pressTab(target: Element, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusableWithin', () => {
  it('finds the tabbable controls in order', () => {
    const { container, buttons } = buildContainer(3);

    expect(focusableWithin(container)).toEqual(buttons);
  });

  it('skips a disabled control', () => {
    const { container, buttons } = buildContainer(2);
    buttons[0]!.disabled = true;

    expect(focusableWithin(container)).toEqual([buttons[1]]);
  });

  it('skips an element that opted out of the tab order', () => {
    const { container } = buildContainer(1);
    const skipped = document.createElement('div');
    skipped.tabIndex = -1;
    container.appendChild(skipped);

    expect(focusableWithin(container)).not.toContain(skipped);
  });
});

describe('trapFocus', () => {
  it('wraps Tab from the last control to the first', () => {
    const { container, buttons } = buildContainer(2);
    const stop = trapFocus(container);

    buttons[1]!.focus();
    const event = pressTab(buttons[1]!);

    expect(document.activeElement).toBe(buttons[0]);
    expect(event.defaultPrevented).toBe(true);
    stop();
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    const { container, buttons } = buildContainer(2);
    const stop = trapFocus(container);

    buttons[0]!.focus();
    pressTab(buttons[0]!, true);

    expect(document.activeElement).toBe(buttons[1]);
    stop();
  });

  it('lets Tab through while focus is in the middle', () => {
    const { container, buttons } = buildContainer(3);
    const stop = trapFocus(container);

    buttons[1]!.focus();
    const event = pressTab(buttons[1]!);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[1]);
    stop();
  });

  it('pulls focus back in when it is outside the container', () => {
    const { container, buttons } = buildContainer(2);
    const stop = trapFocus(container);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    // The key event has to reach the container for the trap to react to it.
    pressTab(container);

    expect(document.activeElement).toBe(buttons[0]);
    stop();
  });

  it('focuses the container itself when nothing inside is tabbable', () => {
    const container = document.createElement('div');
    container.tabIndex = -1;
    document.body.appendChild(container);
    const stop = trapFocus(container);

    pressTab(container);

    expect(document.activeElement).toBe(container);
    stop();
  });

  it('routes Escape when a handler is given', () => {
    const { container } = buildContainer(1);
    const onEscape = vi.fn();
    const stop = trapFocus(container, { onEscape });

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    container.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it('leaves Escape for the page when no handler is given', () => {
    const { container } = buildContainer(1);
    const listener = vi.fn();
    document.body.addEventListener('keydown', listener);
    const stop = trapFocus(container);

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    document.body.removeEventListener('keydown', listener);
  });

  it('stops listening once it is removed', () => {
    const { container, buttons } = buildContainer(2);
    const stop = trapFocus(container);

    buttons[1]!.focus();
    stop();
    const event = pressTab(buttons[1]!);

    expect(document.activeElement).toBe(buttons[1]);
    expect(event.defaultPrevented).toBe(false);
  });
});
