import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockAdapter, type BookingFieldConfig } from '@nickkupriyanov/slotline-core';
import { renderFlow, OPEN_DAYS } from './test/fixtures';
import { Slotline } from './index';
import { render } from '@testing-library/react';

import { createTestAdapter } from './test/fixtures';

const DAY = OPEN_DAYS[0] as string;

const day = (name: RegExp | string) => screen.findByRole('gridcell', { name });

/** No email, a required phone and a required question with options. */
const FIELDS: BookingFieldConfig[] = [
  { name: 'phone', label: 'Phone', type: 'tel', required: true },
  {
    name: 'topic',
    label: 'What is it about?',
    type: 'select',
    required: true,
    hint: 'Pick the closest match',
    options: [
      { value: 'intro', label: 'Intro call' },
      { value: 'review', label: 'Design review' },
    ],
  },
];

async function reachDetails(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await day(/Monday, May 4/));
  await user.click(await screen.findByRole('button', { name: /09:15/ }));
  await screen.findByLabelText('Phone');
}

describe('a configured form', () => {
  it('drops email, adds a required question and starts from the given values', async () => {
    const user = userEvent.setup();
    const { calls } = renderFlow({
      fields: FIELDS,
      defaultValues: { phone: '+49 30 1234567', topic: 'intro' },
    });

    await reachDetails(user);

    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveValue('+49 30 1234567');
    expect(screen.getByLabelText('What is it about?')).toHaveValue('intro');
    expect(screen.getByText('Pick the closest match')).toBeInTheDocument();

    // The prefilled values satisfy the required fields, so the booking goes through.
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
    await waitFor(() => expect(calls.bookings).toHaveLength(1));
    expect(calls.bookings[0]?.values).toMatchObject({
      phone: '+49 30 1234567',
      topic: 'intro',
    });
  });

  it('reports a missing required answer on the field itself', async () => {
    const user = userEvent.setup();
    const { calls } = renderFlow({ fields: FIELDS, defaultValues: { phone: '+49 30 1234567' } });

    await reachDetails(user);
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

    const message = await screen.findByRole('alert');
    expect(message.textContent?.length).toBeGreaterThan(0);
    expect(calls.bookings).toHaveLength(0);
    expect(screen.getByLabelText('What is it about?')).toHaveAttribute('aria-invalid', 'true');
  });

  it('binds a server error to its field and clears it on the next change', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      latency: 0,
      now: () => Date.parse('2026-05-04T09:00:00Z'),
      createBookingFailures: [
        { code: 'VALIDATION_FAILED', fieldErrors: { phone: 'This number is not reachable' } },
      ],
    });
    render(
      <Slotline
        adapter={adapter}
        fields={FIELDS}
        defaultValues={{ phone: '+49 30 000', topic: 'intro' }}
        minDate="2026-05-01"
        maxDate="2026-05-31"
        timeZone="UTC"
        locale="en"
      />,
    );

    await reachDetails(user);
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

    expect(await screen.findByText('This number is not reachable')).toBeInTheDocument();

    // Typing in the field is what clears it: the message belongs to that input.
    await user.type(screen.getByLabelText('Phone'), '1');
    await waitFor(() =>
      expect(screen.queryByText('This number is not reachable')).not.toBeInTheDocument(),
    );
  });

  it('shows an error for an unknown field in the general area', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      latency: 0,
      now: () => Date.parse('2026-05-04T09:00:00Z'),
      createBookingFailures: [
        {
          code: 'VALIDATION_FAILED',
          fieldErrors: { seat: 'That seat was taken', phone: 'Wrong number' },
        },
      ],
    });
    render(
      <Slotline
        adapter={adapter}
        fields={FIELDS}
        defaultValues={{ phone: '+49 30 000', topic: 'intro' }}
        minDate="2026-05-01"
        maxDate="2026-05-31"
        timeZone="UTC"
        locale="en"
      />,
    );

    await reachDetails(user);
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

    // The known field carries its own message; the unknown one is named in the
    // general area so the application still sees that something was reported.
    expect(await screen.findByText('Wrong number')).toBeInTheDocument();
    expect(await screen.findByText(/seat/)).toBeInTheDocument();
  });

  it('gives two widgets their own element ids', async () => {
    const first = createTestAdapter();
    const second = createTestAdapter();

    render(
      <div>
        <Slotline
          adapter={first.adapter}
          minDate="2026-05-01"
          maxDate="2026-05-31"
          timeZone="UTC"
          locale="en"
        />
        <Slotline
          adapter={second.adapter}
          minDate="2026-05-01"
          maxDate="2026-05-31"
          timeZone="UTC"
          locale="en"
        />
      </div>,
    );

    const user = userEvent.setup();
    const days = await screen.findAllByRole('gridcell', { name: /Monday, May 4/ });
    expect(days).toHaveLength(2);

    for (const cell of days) {
      await user.click(cell);
      const offers = await screen.findAllByRole('button', { name: /09:15/ });
      await user.click(offers[0] as HTMLElement);
    }

    await waitFor(() => expect(screen.getAllByLabelText('Your name')).toHaveLength(2));

    // The second widget reached its own form too, and the two never share ids.
    const names = document.querySelectorAll('input[name="name"]');
    expect(names.length).toBeGreaterThanOrEqual(1);
    const ids = Array.from(names)
      .map((input) => input.id)
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
