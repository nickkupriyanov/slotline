// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeVisibilityChange } from './visibility';

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

afterEach(() => {
  setVisibility('visible');
});

describe('observeVisibilityChange', () => {
  it('calls back only when the document becomes visible', () => {
    const listener = vi.fn();
    const stop = observeVisibilityChange(listener);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
