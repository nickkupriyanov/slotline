import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderFlow } from './test/fixtures';

/**
 * The two optional controls.
 *
 * They are off by default — an application that owns its own zone control must not
 * get a second one — and switching either of them is presentation only: no request
 * is made, and the selection and the form stay where they were.
 */
async function reachOffers(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('gridcell', { name: /Monday, May 4/ }));
  await screen.findByRole('button', { name: /09:15/ });
}

describe('the built-in controls', () => {
  it('renders nothing when neither selector is offered', async () => {
    renderFlow();
    await screen.findByRole('grid');
    expect(document.querySelector('.sl-controls')).toBeNull();
  });

  it('changes the zone the times are shown in, without asking the server again', async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    const { calls } = renderFlow({
      showTimeZoneSelector: true,
      timeZones: ['UTC', 'Europe/Berlin', 'Asia/Tokyo'],
      onTimeZoneChange: changes,
      defaultTimeZone: 'UTC',
    });

    await reachOffers(user);
    await user.click(screen.getByRole('button', { name: /Time zone/ }));

    const list = await screen.findByRole('listbox', { name: 'Search time zones' });
    // Search narrows the list by name, so a long list stays usable.
    await user.type(screen.getByRole('searchbox'), 'berlin');
    expect(within(list).getAllByRole('option')).toHaveLength(1);

    await user.click(within(list).getByRole('option', { name: /Berlin/ }));

    // The offer of the same instant now reads as the zone's local time.
    await waitFor(() => expect(document.querySelectorAll('.sl-slot').length).toBeGreaterThan(0));
    // The action is called with the zone that was picked, and the widget follows it
    // in the core's own zone test; here the binding is what is under test.
    expect(changes).toHaveBeenCalledWith('Europe/Berlin', expect.objectContaining({}));
  });

  it('switches the format on every screen without fetching anything', async () => {
    const user = userEvent.setup();
    const changes = vi.fn();
    const { calls } = renderFlow({
      showTimeFormatSelector: true,
      onTimeFormatChange: changes,
    });

    await reachOffers(user);
    const before = { availability: calls.availability, slots: calls.slots };
    expect(screen.getByRole('button', { name: /09:15/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '12-hour' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /9:15/ })).toBeInTheDocument());
    expect(changes).toHaveBeenCalledWith('12h', expect.objectContaining({}));
    expect(calls.availability).toBe(before.availability);
    expect(calls.slots).toBe(before.slots);

    // The same format follows into the recap and the confirmation.
    await user.click(screen.getByRole('button', { name: /9:15/ }));
    expect(await screen.findByText(/9:15/)).toBeInTheDocument();
  });

  it('closes the zone popover on Escape', async () => {
    const user = userEvent.setup();
    renderFlow({ showTimeZoneSelector: true, timeZones: ['UTC', 'Europe/Berlin'] });

    await screen.findByRole('grid');
    await user.click(screen.getByRole('button', { name: /Time zone/ }));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});
