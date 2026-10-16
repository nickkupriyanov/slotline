import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createMockAdapter,
  type AvailabilityAdapter,
  type BookingSelection,
} from '@nickkupriyanov/slotline-core';
import { Slotline } from './index';

const NOW = Date.parse('2026-05-04T09:00:00Z');
const DAY = '2026-05-04';

/**
 * Availability only: the point of the selection mode is that an application which
 * never creates anything does not have to write a `createBooking` stub.
 */
function availabilityOf(): AvailabilityAdapter {
  const mock = createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
  });

  return {
    getAvailability: (query) => mock.getAvailability(query),
    getSlots: (query) => mock.getSlots(query),
  };
}

function mount(props: Partial<Parameters<typeof Slotline>[0]> = {}) {
  return render(
    <Slotline
      mode="selection"
      adapter={availabilityOf()}
      timeZone="UTC"
      locale="en"
      minDate={DAY}
      maxDate="2026-05-31"
      {...props}
    />,
  );
}

async function pickFirstOffer(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const cell = await waitFor(() => {
    const candidate = Array.from(document.querySelectorAll<HTMLElement>('[role="gridcell"]')).find(
      (element) => element.getAttribute('data-day') === DAY,
    );
    if (!candidate) throw new Error('the day is not in the grid yet');
    return candidate;
  });

  await user.click(cell);
  const offer = await waitFor(() => {
    const candidate = document.querySelector<HTMLElement>('.sl-slot');
    if (!candidate) throw new Error('no offer yet');
    return candidate;
  });
  await user.click(offer);
}

describe('<Slotline mode="selection" />', () => {
  it('stops at the offer and never opens a form', async () => {
    const user = userEvent.setup();
    mount();

    await pickFirstOffer(user);

    const root = document.querySelector('.sl-root');
    expect(root?.getAttribute('data-sl-step')).toBe('time');
    // No form step, and nothing that could create anything.
    expect(document.querySelector('.sl-submit')).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirm booking/ })).not.toBeInTheDocument();
  });

  it('reports the selection it proposes', async () => {
    const user = userEvent.setup();
    const changes: BookingSelection[] = [];
    mount({ onSelectionChange: (selection) => changes.push(selection) });

    await pickFirstOffer(user);

    await waitFor(() => expect(changes.length).toBeGreaterThan(1));
    expect(changes[0]).toEqual({ date: DAY, slot: null });
    expect(changes.at(-1)?.date).toBe(DAY);
    expect(changes.at(-1)?.slot?.start).toBeTruthy();
  });

  it('applies nothing while the selection is controlled', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    mount({ selection: null, onSelectionChange });

    const cell = await waitFor(() => {
      const candidate = document.querySelector<HTMLElement>(`[data-day="${DAY}"]`);
      if (!candidate) throw new Error('the day is not in the grid yet');
      return candidate;
    });
    await user.click(cell);

    // The proposal is reported; the widget waits for the owner to accept it.
    expect(onSelectionChange).toHaveBeenCalledWith(
      { date: DAY, slot: null },
      expect.objectContaining({ reason: 'date-select' }),
    );
    expect(document.querySelector('.sl-slot')).toBeNull();
  });

  it('runs the flow once the owner echoes the value back', async () => {
    const user = userEvent.setup();

    /** The realistic controlled usage: the application stores what the widget proposes. */
    function Controlled() {
      const [selection, setSelection] = useState<BookingSelection>(null);
      return (
        <Slotline
          mode="selection"
          adapter={availabilityOf()}
          timeZone="UTC"
          locale="en"
          minDate={DAY}
          maxDate="2026-05-31"
          selection={selection}
          onSelectionChange={setSelection}
        />
      );
    }

    render(<Controlled />);

    const cell = await waitFor(() => {
      const candidate = document.querySelector<HTMLElement>(`[data-day="${DAY}"]`);
      if (!candidate) throw new Error('the day is not in the grid yet');
      return candidate;
    });
    await user.click(cell);

    const offer = await waitFor(() => {
      const candidate = document.querySelector<HTMLElement>('.sl-slot');
      if (!candidate) throw new Error('no offer yet');
      return candidate;
    });
    await user.click(offer);

    // The owner echoed it, so the widget shows it as selected — and still never
    // leaves the offers.
    await waitFor(() => expect(document.querySelector('.sl-slot.is-selected')).not.toBeNull());
    expect(document.querySelector('.sl-root')?.getAttribute('data-sl-step')).toBe('time');
  });
});
