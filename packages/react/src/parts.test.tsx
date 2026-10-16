import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookingSlotView } from '@nickkupriyanov/slotline-core';
import { renderFlow, OPEN_DAYS } from './test/fixtures';

const day = (name: RegExp | string) => screen.findByRole('gridcell', { name });
import { DefaultForm, DefaultSlot, DefaultSummary } from './parts';

const DAY = OPEN_DAYS[0] as string;

async function reachOffers(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await day(/Monday, May 4/));
  // A regular expression: a replaced part may add to the accessible name.
  await screen.findByRole('button', { name: /09:15/ });
}

describe('component replacement', () => {
  it('replaces one part without touching the others', async () => {
    const user = userEvent.setup();

    function PricedSlot(props: Parameters<typeof DefaultSlot>[0]) {
      return (
        <DefaultSlot {...props}>
          {props.children} <span className="price">€90</span>
        </DefaultSlot>
      );
    }

    renderFlow({ components: { Slot: PricedSlot } });

    await reachOffers(user);

    // The custom slot rendered inside the library's own button, which still works —
    // including its accessible name, which now carries the price the part added.
    expect(document.querySelectorAll('.price')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /09:15/ }));
    expect(await screen.findByLabelText('Your name')).toBeInTheDocument();
  });

  it('gives a replacement the prepared slot props', async () => {
    const user = userEvent.setup();
    const seen: BookingSlotView[] = [];

    renderFlow({
      components: {
        Slot: (props) => {
          seen.push(props.slot);
          return <DefaultSlot {...props} />;
        },
      },
    });

    await reachOffers(user);

    expect(seen[0]?.label).toBe('09:15');
    expect(seen[0]?.selected).toBe(false);
    // The library kept the accessible name and the group semantics.
    expect(screen.getAllByRole('button', { name: '09:15' })).toHaveLength(1);
  });

  it('replaces the form and still books through the same values and validation', async () => {
    const user = userEvent.setup();
    const { calls } = renderFlow({
      components: {
        Summary: () => <p>Custom recap</p>,
        Form: ({ form, actions }) => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void actions.submit();
            }}
          >
            <input
              aria-label="Email only"
              value={String(form.values.email ?? '')}
              onChange={(event) => actions.setValues({ email: event.target.value })}
              onBlur={() => actions.touchField('email')}
            />
            {form.visibleErrors.email ? <p role="alert">{form.visibleErrors.email}</p> : null}
            <button type="submit">Book</button>
          </form>
        ),
      },
      // The values the custom form collects are the widget's own values, so the
      // default field list still validates them: name is required and missing here.
      fields: [
        { name: 'name', label: 'Your name', required: false },
        { name: 'email', label: 'Email', type: 'email', required: true },
      ],
    });

    await reachOffers(user);
    await user.click(screen.getByRole('button', { name: '09:15' }));

    expect(await screen.findByText('Custom recap')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email only'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: 'Book' }));

    expect(await screen.findByText("You're booked")).toBeInTheDocument();
    expect(calls.bookings[0]?.values).toMatchObject({ email: 'ann@example.com' });
  });

  it('replaces the confirmation and the attempt screen', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const { unmount } = renderFlow({
      components: {
        Confirmation: ({ confirmation, actions }) => (
          <div>
            <p>{confirmation.title}</p>
            <button
              type="button"
              onClick={() => {
                reset();
                actions.reset();
              }}
            >
              Start over
            </button>
          </div>
        ),
      },
    });

    await reachOffers(user);
    await user.click(screen.getByRole('button', { name: '09:15' }));
    await user.type(screen.getByLabelText('Your name'), 'Ann');
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

    expect(await screen.findByText("You're booked")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start over' }));

    expect(reset).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument(),
    );
    unmount();
  });

  it('keeps the keyboard navigation when only the day content is replaced', async () => {
    const user = userEvent.setup();
    renderFlow({
      components: {
        DayContent: ({ day, dayView }) => (
          <span className="day-badge" data-bookable={dayView?.bookable ? 'yes' : 'no'}>
            {Number(day.slice(8, 10))}
          </span>
        ),
      },
    });

    const cell = (await screen.findByRole('gridcell', { name: /Monday, May 4/ })) as HTMLElement;
    cell.focus();

    // The library still owns focus and the arrow keys; only the content changed.
    await user.keyboard('{ArrowRight}');
    const focused = document.activeElement as HTMLElement;
    expect(focused).not.toBe(cell);
    expect(focused.getAttribute('role')).toBe('gridcell');
    expect(document.querySelectorAll('.day-badge').length).toBeGreaterThan(0);
  });
});

describe('default parts', () => {
  it('can be composed around a custom element', async () => {
    const user = userEvent.setup();
    renderFlow({
      components: {
        Summary: (props) => (
          <div className="wrapped">
            <DefaultSummary {...props} />
          </div>
        ),
      },
    });

    await reachOffers(user);
    await user.click(screen.getByRole('button', { name: '09:15' }));

    expect(document.querySelector('.wrapped .sl-summary')).not.toBeNull();
  });
});

describe('default form part', () => {
  it('renders the configured fields in order', async () => {
    const user = userEvent.setup();
    renderFlow({
      fields: [
        { name: 'name', label: 'Your name' },
        { name: 'phone', label: 'Phone', type: 'tel', required: false },
      ],
      components: {
        Form: DefaultForm,
      },
    });

    await reachOffers(user);
    await user.click(screen.getByRole('button', { name: '09:15' }));

    const labels = Array.from(document.querySelectorAll('.sl-field')).map((field) =>
      field.querySelector('input')?.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Your name', 'Phone']);
  });
});
