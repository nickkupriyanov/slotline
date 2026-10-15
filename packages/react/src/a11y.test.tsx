import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderFlow } from './test/fixtures';

const day = (name: RegExp | string) => screen.findByRole('gridcell', { name });

describe('accessibility — structure and naming', () => {
  it('announces the flow as a progressbar that advances', async () => {
    const user = userEvent.setup();
    renderFlow();

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(progress).toHaveAttribute('aria-valuetext', 'Step 1 of 4');

    await user.click(await day(/Monday, May 4/));
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2'),
    );
  });

  it('gives every day an accessible name including its availability', async () => {
    renderFlow();

    expect(
      await screen.findByRole('gridcell', { name: 'Monday, May 4, 2 slots' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('gridcell', { name: 'Thursday, May 7, No times available' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('names the calendar, the slot list and the duration group', async () => {
    const user = userEvent.setup();
    renderFlow();

    expect(screen.getByRole('grid', { name: 'Choose a date' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Meeting duration' })).toBeInTheDocument();

    await user.click(await day(/Monday, May 4/));
    expect(await screen.findByRole('group', { name: 'Choose a time' })).toBeInTheDocument();
  });

  it('publishes step changes through a live region', async () => {
    const user = userEvent.setup();
    renderFlow();

    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 4');

    await user.click(await day(/Monday, May 4/));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 4'));
  });

  it('keeps a single tab stop in the month grid', async () => {
    renderFlow();
    const cells = await screen.findAllByRole('gridcell');
    const stops = cells.filter((cell) => cell.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('data-day', '2026-05-04');
  });
});

describe('accessibility — keyboard', () => {
  it('moves focus with the arrow keys, Home, End and PageDown', async () => {
    const user = userEvent.setup();
    renderFlow();

    const start = await day(/Monday, May 4/);
    start.focus();

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-day', '2026-05-05'));

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-day', '2026-05-12'));

    await user.keyboard('{Home}');
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-day', '2026-05-10'));

    await user.keyboard('{End}');
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-day', '2026-05-16'));

    await user.keyboard('{PageDown}');
    await waitFor(() => expect(screen.getByText('June 2026')).toBeInTheDocument());
  });

  it('activates a day with the keyboard', async () => {
    const user = userEvent.setup();
    renderFlow();

    (await day(/Monday, May 4/)).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: '09:15' })).toBeInTheDocument();
  });

  it('moves focus into the panel when the activated element unmounts', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(await day(/Monday, May 4/));
    await waitFor(() => expect(document.activeElement).toHaveClass('sl-panel'));
  });

  it('traps Tab inside the card when trapFocus is on', async () => {
    const user = userEvent.setup();
    renderFlow({ trapFocus: true });

    const pills = screen.getAllByRole('radio');
    const last = pills[pills.length - 1];
    last?.focus();
    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous month' }));
  });

  it('sends Escape to the back action when trapFocus is on', async () => {
    const user = userEvent.setup();
    renderFlow({ trapFocus: true });

    await user.click(await day(/Monday, May 4/));
    await screen.findByRole('button', { name: '09:15' });
    await user.keyboard('{Escape}');

    expect(await screen.findByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });
});
