// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '@nickkupriyanov/slotline-core';
import { Slotline } from './index';

/**
 * Server rendering, in a real Node environment: no `window`, no `document`, no
 * effects. The widget has to produce its first step from the controller's initial
 * snapshot alone, with the deterministic locale and zone the core falls back to.
 */
describe('server rendering', () => {
  it('renders the first step without a browser', () => {
    expect(typeof window).toBe('undefined');

    const html = renderToString(
      <Slotline adapter={createMockAdapter({ latency: 0, timeZone: 'UTC' })} locale="en" />,
    );

    expect(html).toContain('sl-root');
    expect(html).toContain('data-sl-step="date"');
    expect(html).toContain('Book a meeting');
    // The server snapshot is the controller's own and nothing has been fetched:
    // effects do not run, so the calendar reports its initial state.
    expect(html).toContain('sl-calendar');
    expect(html).toContain('data-status="idle"');
    expect(html.match(/role="gridcell"/g) ?? []).toHaveLength(42);
  });

  it('renders Russian copy when the locale is pinned', () => {
    const html = renderToString(
      <Slotline adapter={createMockAdapter({ latency: 0, timeZone: 'UTC' })} locale="ru" />,
    );

    expect(html).toContain('Записаться на встречу');
  });
});
