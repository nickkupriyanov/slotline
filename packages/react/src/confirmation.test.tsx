import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BookingAdapter, BookingResult } from '@nickkupriyanov/slotline-core';
import { renderFlow, createTestAdapter } from './test/fixtures';

/** Books once with an adapter that returns the given record. */
async function book(result: BookingResult): Promise<void> {
  const user = userEvent.setup();
  const { adapter } = createTestAdapter({
    createBooking: async () => result,
  } as Partial<BookingAdapter>);

  renderFlow({ adapter: { ...adapter } });

  await user.click(await screen.findByRole('gridcell', { name: /Monday, May 4/ }));
  await user.click(await screen.findByRole('button', { name: /09:15/ }));
  await user.type(await screen.findByLabelText('Your name'), 'Ann');
  await user.type(screen.getByLabelText('Email'), 'ann@example.com');
  await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

  await screen.findByText("You're booked");
}

const EMAIL = 'ann@example.com';

describe('the extended confirmation', () => {
  it('shows the meeting link the backend returned, and the calendar entry', async () => {
    await book({
      id: 'booking_7',
      status: 'confirmed',
      invitation: { status: 'sent', email: EMAIL },
      joinUrl: 'https://meet.example.com/abc',
      calendarUrl: 'https://calendar.example.com/abc.ics',
    });

    expect(screen.getByRole('link', { name: 'Join the meeting' })).toHaveAttribute(
      'href',
      'https://meet.example.com/abc',
    );
    expect(screen.getByRole('link', { name: 'Add to calendar' })).toHaveAttribute(
      'href',
      'https://calendar.example.com/abc.ics',
    );
    // Nothing was provided for these, so no empty action is rendered.
    expect(screen.queryByRole('link', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows the place and the instructions of an in-person booking', async () => {
    await book({
      id: 'booking_8',
      status: 'confirmed',
      invitation: { status: 'sent', email: EMAIL },
      location: 'Studio 2, Torstraße 14',
      instructions: 'Ring the bell twice.',
      rescheduleUrl: 'https://app.example.com/booking/8/reschedule',
      cancelUrl: 'https://app.example.com/booking/8/cancel',
    });

    expect(screen.getByText('Where')).toBeInTheDocument();
    expect(screen.getByText('Studio 2, Torstraße 14')).toBeInTheDocument();
    expect(screen.getByText('Ring the bell twice.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reschedule' })).toHaveAttribute(
      'href',
      'https://app.example.com/booking/8/reschedule',
    );
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      'https://app.example.com/booking/8/cancel',
    );
    // No online meeting, so no join link.
    expect(screen.queryByRole('link', { name: 'Join the meeting' })).not.toBeInTheDocument();
  });

  it('renders only what the backend actually returned', async () => {
    await book({ id: 'booking_9', status: 'confirmed' });

    // No invitation line, no place, no instructions, no actions.
    expect(document.querySelector('.sl-confirmation-place')).toBeNull();
    expect(document.querySelector('.sl-confirmation-instructions')).toBeNull();
    expect(document.querySelector('.sl-confirmation-actions')).toBeNull();
    // The confirmation itself is still there: the record id stays available to the
    // application through `view.confirmation.id`.
    expect(document.querySelector('.sl-confirmation')).not.toBeNull();
  });

  it('never claims the invite was sent when the backend says otherwise', async () => {
    await book({
      id: 'booking_10',
      status: 'confirmed',
      invitation: { status: 'pending', email: EMAIL },
    });
    expect(screen.getByText(`The calendar invite to ${EMAIL} is being sent.`)).toBeInTheDocument();
    expect(screen.queryByText(`Calendar invite sent to ${EMAIL}.`)).not.toBeInTheDocument();
  });

  it('reports a failed invitation as failed', async () => {
    await book({
      id: 'booking_11',
      status: 'confirmed',
      invitation: { status: 'failed', email: EMAIL },
    });
    await waitFor(() =>
      expect(
        screen.getByText(`The calendar invite to ${EMAIL} could not be sent.`),
      ).toBeInTheDocument(),
    );
  });
});
