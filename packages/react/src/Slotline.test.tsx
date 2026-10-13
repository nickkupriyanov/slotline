import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createTestAdapter, renderFlow } from './test/fixtures';

const day = (name: RegExp | string) => screen.findByRole('gridcell', { name });

describe('<Slotline /> — calendar', () => {
  it('renders six weeks and marks only bookable days', async () => {
    renderFlow();

    const cells = await screen.findAllByRole('gridcell');
    expect(cells).toHaveLength(42);

    const monday = await day(/Monday, May 4/);
    expect(monday).not.toHaveAttribute('aria-disabled');
    expect(monday.querySelector('.sl-day-dot')).toHaveAttribute('data-visible');

    const thursday = screen.getByRole('gridcell', { name: /Thursday, May 7/ });
    expect(thursday).toHaveAttribute('aria-disabled', 'true');
    expect(thursday.querySelector('.sl-day-dot')).not.toHaveAttribute('data-visible');
  });

  it('asks the adapter for the visible month and the selected duration', async () => {
    const { calls } = renderFlow();
    await waitFor(() => expect(calls.availability).toBe(1));
    expect(calls.availabilityQueries[0]).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
      duration: 15,
    });
  });

  it('refetches when the month changes', async () => {
    const user = userEvent.setup();
    const { calls } = renderFlow();
    await waitFor(() => expect(calls.availability).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(calls.availabilityQueries.at(-1)?.from).toBe('2026-06-01'));

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(calls.availabilityQueries.at(-1)?.from).toBe('2026-05-01'));
  });

  it('invalidates availability when the duration changes', async () => {
    const user = userEvent.setup();
    const { calls } = renderFlow();
    await waitFor(() => expect(calls.availability).toBe(1));

    await user.click(screen.getByRole('radio', { name: '30 min' }));
    await waitFor(() => expect(calls.availabilityQueries.at(-1)?.duration).toBe(30));
    expect(screen.getByRole('radio', { name: '30 min' })).toBeChecked();
  });
});

describe('<Slotline /> — booking', () => {
  it('books a slot end to end and reports the request', async () => {
    const user = userEvent.setup();
    const onBooked = vi.fn();
    const { calls } = renderFlow({ onBooked });

    await user.click(await day(/Monday, May 4/));

    const slot = await screen.findByRole('button', { name: '09:15' });
    await user.click(slot);

    expect(screen.getByText('Monday, May 4')).toBeInTheDocument();
    expect(screen.getByText('09:15 · 15 min')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: /Confirm booking/ });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Your name'), 'Ann');
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(await screen.findByText("You're booked")).toBeInTheDocument();
    expect(screen.getByText('Calendar invite sent to ann@example.com.')).toBeInTheDocument();

    expect(calls.bookings).toHaveLength(1);
    expect(calls.bookings[0]).toMatchObject({
      date: '2026-05-04',
      duration: 15,
      timeZone: 'UTC',
      details: { name: 'Ann', email: 'ann@example.com' },
    });
    expect(calls.bookings[0]?.slot).toEqual({
      start: '2026-05-04T09:15:00Z',
      end: '2026-05-04T09:30:00.000Z',
    });
    expect(onBooked).toHaveBeenCalledWith(
      { id: 'booking_1', inviteeEmail: 'ann@example.com' },
      expect.objectContaining({ date: '2026-05-04' }),
    );
  });

  it('shows validation messages once a field is touched', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(await day(/Monday, May 4/));
    await user.click(await screen.findByRole('button', { name: '09:15' }));

    await user.click(screen.getByLabelText('Your name'));
    await user.click(screen.getByLabelText('Email'));

    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.tab();
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('surfaces adapter failures and lets the user retry', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    let attempt = 0;
    const { adapter } = createTestAdapter({
      async createBooking(request) {
        attempt += 1;
        if (attempt === 1) throw new Error('Calendar is unreachable');
        return { id: 'retry_ok', inviteeEmail: request.details.email };
      },
    });

    renderFlow({ adapter, onError });

    await user.click(await day(/Monday, May 4/));
    await user.click(await screen.findByRole('button', { name: '09:15' }));
    await user.type(screen.getByLabelText('Your name'), 'Ann');
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Calendar is unreachable');
    expect(onError).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText("You're booked")).toBeInTheDocument();
  });

  it('goes back to the previous step', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(await day(/Monday, May 4/));
    await user.click(await screen.findByRole('button', { name: '09:15' }));
    expect(screen.getByText('Monday, May 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: '09:15' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('restarts with “Book another”', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(await day(/Monday, May 4/));
    await user.click(await screen.findByRole('button', { name: '09:15' }));
    await user.type(screen.getByLabelText('Your name'), 'Ann');
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
    await screen.findByText("You're booked");

    await user.click(screen.getByRole('button', { name: 'Book another' }));
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(screen.getByText('Book a meeting')).toBeInTheDocument();

    // The details are cleared, but the calendar stays warm: no new availability call.
    await user.click(await day(/Monday, May 4/));
    await user.click(await screen.findByRole('button', { name: '09:15' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('reports an empty day instead of an empty grid', async () => {
    const user = userEvent.setup();
    renderFlow({
      adapter: createTestAdapter({
        async getAvailability() {
          return [{ date: '2026-05-04', slotCount: 1 }];
        },
        async getSlots() {
          return [];
        },
      }).adapter,
    });

    await user.click(await day(/Monday, May 4/));
    expect(await screen.findByText('No times available')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pick another day' }));
    expect(await screen.findByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });
});

describe('<Slotline /> — locale, time zone, theming', () => {
  it('renders Russian copy and Russian date formatting', async () => {
    renderFlow({ locale: 'ru' });

    expect(screen.getByText('Записаться на встречу')).toBeInTheDocument();
    expect(await screen.findByRole('gridcell', { name: /4 мая, Слотов: 2/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30 мин' })).toBeInTheDocument();
  });

  it('renders slot times in the requested time zone', async () => {
    const user = userEvent.setup();
    renderFlow({ timeZone: 'Europe/Berlin' });

    await user.click(await day(/Monday, May 4/));
    expect(await screen.findByRole('button', { name: '11:15' })).toBeInTheDocument();
  });

  it('exposes the resolved theme on the root element', () => {
    const { container } = renderFlow();
    expect(container.querySelector('.sl-root')).toHaveAttribute('data-sl-theme', 'dark');
  });

  it('supports a light theme and a custom title', () => {
    const { container } = renderFlow({ theme: 'light', title: 'Demo call' });
    expect(screen.getByText('Demo call')).toBeInTheDocument();
    expect(container.querySelector('.sl-root')).toHaveAttribute('data-sl-theme', 'light');
  });
});
