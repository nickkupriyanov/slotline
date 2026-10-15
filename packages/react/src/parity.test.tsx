import { act, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SLOT_CLASS, createMockAdapter } from '@nickkupriyanov/slotline-core';
import { parityCases, type ParityHarness } from '../../../tools/parity/scenarios';
import { Slotline } from './index';

/**
 * The React side of the parity suite.
 *
 * It implements the shared harness with real user interactions; what the scenarios
 * expect of it lives in `tools/parity/scenarios.ts`, next to the Angular harness.
 */
function createHarness(): ParityHarness {
  const user = userEvent.setup();
  const requests: Array<{ date: string; email: string; idempotencyKey: string }> = [];
  let selectedDay: string | null = null;

  const adapter = createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
  });

  const all = <T extends Element>(selector: string): T[] =>
    Array.from(document.querySelectorAll<T>(selector));
  const one = <T extends Element>(selector: string): T | null =>
    document.querySelector<T>(selector);
  const attr = (selector: string, name: string): string => one(selector)?.getAttribute(name) ?? '';
  const text = (selector: string): string => one(selector)?.textContent?.trim() ?? '';

  const cells = () => all<HTMLElement>('[role="gridcell"]');
  const bookableCells = () =>
    cells().filter((cell) => cell.getAttribute('aria-disabled') !== 'true');

  /** Lets React flush the state change before the next assertion. */
  const settle = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  const click = async (element: Element): Promise<void> => {
    await user.click(element);
    await settle();
  };

  return {
    async render() {
      render(
        <Slotline
          adapter={adapter}
          timeZone="UTC"
          locale="en"
          onBooked={(_result, request) => {
            requests.push({
              date: request.date,
              email: String(request.values.email ?? ''),
              idempotencyKey: request.idempotencyKey,
            });
          }}
        />,
      );
      await waitFor(() => expect(bookableCells().length).toBeGreaterThan(0));
    },

    async pickFirstBookableDay() {
      const cell = bookableCells()[0];
      if (!cell) throw new Error('no bookable day in the grid');
      selectedDay = cell.getAttribute('data-day');
      await click(cell);
      await waitFor(() => expect(all(`.${SLOT_CLASS.slot}`).length).toBeGreaterThan(0));
    },

    async pickFirstOffer() {
      const offer = one<HTMLElement>(`.${SLOT_CLASS.slot}`);
      if (!offer) throw new Error('no offer to pick');
      await click(offer);
      await waitFor(() => expect(one(`input[aria-label="Your name"]`)).toBeTruthy());
    },

    async type(label, value) {
      const control = one<HTMLInputElement>(`input[aria-label="${label}"]`);
      if (!control) throw new Error(`no control labelled "${label}"`);
      await user.clear(control);
      await user.type(control, value);
      await settle();
    },

    async submit() {
      const button = one<HTMLButtonElement>(`.${SLOT_CLASS.submit}`);
      if (!button) throw new Error('no submit button');
      await click(button);
    },

    async goBack() {
      const button = one<HTMLButtonElement>('.sl-icon-button');
      if (!button) throw new Error('no back affordance');
      await click(button);
    },

    async selectDuration(index) {
      const pill = all<HTMLElement>('[role="radiogroup"] [role="radio"]')[index];
      if (!pill) throw new Error(`no duration option at ${index}`);
      await click(pill);
    },

    selectedDay: () => selectedDay,
    booked: () => requests[0] ?? null,

    obs: {
      step: () => attr(`.${SLOT_CLASS.root}`, 'data-sl-step'),
      title: () => text(`.${SLOT_CLASS.title}`),
      durationBadge: () => text(`.${SLOT_CLASS.badge}`),
      gridCells: () => cells().length,
      bookableDays: () => bookableCells().length,
      offers: () => all(`.${SLOT_CLASS.slot}`).length,
      liveMessage: () => text('[role="status"]'),
      formErrors: () => all('[role="alert"]').length,
      errorText: () =>
        all('[role="alert"]')
          .map((alert) => alert.textContent ?? '')
          .join(' '),
      confirmationTitle: () => text(`.${SLOT_CLASS.confirmationTitle}`),
      checkedDuration: () => text('[role="radiogroup"] [role="radio"][aria-checked="true"]'),
    },
  };
}

describe('parity with the shared scenarios', () => {
  for (const scenario of parityCases) {
    it(scenario.name, async () => {
      const harness = createHarness();
      await expect(scenario.run(harness)).resolves.toEqual(scenario.expected);
    });
  }
});
