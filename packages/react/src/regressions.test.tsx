/**
 * Regression tests for the review findings (P1/P2).
 *
 * Each test below failed against the implementation that the review looked at.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SlotlineProvider } from './Slotline';
import { SlotlineView } from './components/SlotlineView';
import { useSlotlineContext } from './context';
import { BASE_PROPS, createTestAdapter, renderFlow, slotsFor } from './test/fixtures';
import type { SlotlineProps, BookingResult } from './types';
import type { UseBookingFlowResult } from './useBookingFlow';

const day = (name: RegExp | string) => screen.findByRole('gridcell', { name });

function Capturer({ capture }: { capture: (flow: UseBookingFlowResult) => void }) {
  const flow = useSlotlineContext();
  useEffect(() => {
    capture(flow);
  });
  return null;
}

/** Renders the built-in view together with a handle on the headless actions. */
function renderWithActions(props: Partial<SlotlineProps>) {
  let flow: UseBookingFlowResult | undefined;
  const adapter = props.adapter ?? createTestAdapter().adapter;
  render(
    <SlotlineProvider adapter={adapter} {...BASE_PROPS} {...props}>
      <SlotlineView />
      <Capturer
        capture={(next) => {
          flow = next;
        }}
      />
    </SlotlineProvider>,
  );
  return {
    actions: () => {
      if (!flow) throw new Error('flow not captured yet');
      return flow;
    },
    adapter,
  };
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Ann');
  await user.type(screen.getByLabelText('Email'), 'ann@example.com');
}

async function reachDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await day(/Monday, May 4/));
  await user.click(await screen.findByRole('button', { name: '09:15' }));
}

/* -------------------------------------------------------------------------- */
/*  P1 — slots never leave the loading state                                   */
/* -------------------------------------------------------------------------- */

describe('P1: availability that already contains slots', () => {
  it('renders inline slots and never calls getSlots', async () => {
    const user = userEvent.setup();
    const getSlots = vi.fn(async () => []);
    const adapter = createTestAdapter({
      async getAvailability() {
        return [{ date: '2026-05-04', slots: slotsFor('2026-05-04') }];
      },
      getSlots,
    }).adapter;

    renderFlow({ adapter });
    await user.click(await day(/Monday, May 4/));

    expect(await screen.findByRole('button', { name: '09:15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10:00' })).toBeInTheDocument();
    expect(getSlots).not.toHaveBeenCalled();
  });
});

describe('P1: picking the same day again', () => {
  it('reloads the slots instead of staying on the skeleton', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(await day(/Monday, May 4/));
    await screen.findByRole('button', { name: '09:15' });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await day(/Monday, May 4/));

    expect(await screen.findByRole('button', { name: '09:15' })).toBeInTheDocument();
  });

  it('refetches the slots for the repeated selection', async () => {
    const user = userEvent.setup();
    const { calls } = renderFlow();

    await user.click(await day(/Monday, May 4/));
    await screen.findByRole('button', { name: '09:15' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await day(/Monday, May 4/));

    await waitFor(() => expect(calls.slotQueries).toEqual(['2026-05-04', '2026-05-04']));
  });
});

/* -------------------------------------------------------------------------- */
/*  P1/P2 — the booking request and the screen must stay in sync               */
/* -------------------------------------------------------------------------- */

function deferredAdapter() {
  let resolveBooking: ((result: BookingResult) => void) | undefined;
  const createBooking = vi.fn(
    () =>
      new Promise<BookingResult>((resolve) => {
        resolveBooking = resolve;
      }),
  );
  return {
    adapter: createTestAdapter({ createBooking }).adapter,
    createBooking,
    resolve: (result: BookingResult) => resolveBooking?.(result),
  };
}

describe('P1: a slow booking response must not confirm another selection', () => {
  it('drops the confirmation when the headless caller moved to another slot', async () => {
    const user = userEvent.setup();
    const onBooked = vi.fn();
    const { adapter, createBooking, resolve } = deferredAdapter();
    const harness = renderWithActions({ adapter, onBooked });

    await reachDetails(user);
    await fillDetails(user);

    await act(async () => {
      void harness.actions().actions.submit();
    });
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));

    // A headless consumer can move the selection even though the built-in UI
    // disables navigation while a request is in flight.
    await act(async () => {
      harness.actions().actions.selectSlot({ id: 'slot-2', start: '2026-05-04T10:00:00Z' });
    });

    await act(async () => {
      resolve({
        id: 'stale',
        status: 'confirmed',
        invitation: { status: 'sent', email: 'ann@example.com' },
      });
    });

    expect(screen.queryByText("You're booked")).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    // The backend really did create a booking, so the consumer still hears about it.
    expect(onBooked).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stale' }),
      expect.objectContaining({
        slot: expect.objectContaining({ start: '2026-05-04T09:15:00Z' }),
      }),
    );
  });

  it('disables the back affordance while the request is in flight', async () => {
    const user = userEvent.setup();
    const { adapter, createBooking, resolve } = deferredAdapter();
    const harness = renderWithActions({ adapter });

    await reachDetails(user);
    await fillDetails(user);

    await act(async () => {
      void harness.actions().actions.submit();
    });
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    await act(async () => {
      resolve({ id: 'ok', status: 'confirmed' });
    });
    expect(await screen.findByText("You're booked")).toBeInTheDocument();
  });
});

describe('P2: submit is not re-entrant', () => {
  it('calls createBooking once for two synchronous submits', async () => {
    const user = userEvent.setup();
    const { adapter, createBooking, resolve } = deferredAdapter();
    const harness = renderWithActions({ adapter });

    await reachDetails(user);
    await fillDetails(user);

    await act(async () => {
      void harness.actions().actions.submit();
      void harness.actions().actions.submit();
    });

    expect(createBooking).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ id: 'once', status: 'confirmed' });
    });
    expect(await screen.findByText("You're booked")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/*  P2 — the month grid must always keep one tab stop                          */
/* -------------------------------------------------------------------------- */

function tabStops() {
  return screen.getAllByRole('gridcell').filter((cell) => cell.getAttribute('tabindex') === '0');
}

describe('P2: keyboard navigation across months', () => {
  it('moves focus into the new month and keeps a single tab stop', async () => {
    const user = userEvent.setup();
    renderFlow();

    (await day(/Monday, May 4/)).focus();
    await user.keyboard('{PageDown}');

    await waitFor(() => expect(screen.getByText('June 2026')).toBeInTheDocument());
    const stops = tabStops();
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('data-day', '2026-06-04');
    await waitFor(() => expect(document.activeElement).toBe(stops[0]));
  });

  it('keeps a tab stop when the month changes through the nav button', async () => {
    const user = userEvent.setup();
    renderFlow();

    (await day(/Monday, May 4/)).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-day', '2026-05-05'));

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(screen.getByText('June 2026')).toBeInTheDocument());

    const stops = tabStops();
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('tabindex', '0');
  });
});

/* -------------------------------------------------------------------------- */
/*  P2 — dismissing from the confirmation                                      */
/* -------------------------------------------------------------------------- */

describe('P2: the confirmation step is dismissible', () => {
  it('calls onDismiss from the back affordance', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderFlow({ onDismiss });

    await reachDetails(user);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
    await screen.findByText("You're booked");

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss on Escape', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderFlow({ onDismiss, trapFocus: true });

    await reachDetails(user);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));
    await screen.findByText("You're booked");

    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  P1 — the same slot booked again is still a different scenario              */
/* -------------------------------------------------------------------------- */

describe('P1: a reset while the request is in flight', () => {
  it('returns to the calendar once the abandoned request lands', async () => {
    const user = userEvent.setup();
    const onBooked = vi.fn();
    const { adapter, createBooking, resolve } = deferredAdapter();
    const harness = renderWithActions({ adapter, onBooked });

    await reachDetails(user);
    await fillDetails(user);

    await act(async () => {
      void harness.actions().actions.submit();
    });
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1));

    // The consumer abandons the flow while the request is in flight…
    await act(async () => {
      harness.actions().actions.reset();
    });

    // …but the attempt owns the screen until its outcome is known: the widget no
    // longer lets a second booking start on top of an unsettled one.
    expect(screen.queryByRole('button', { name: 'Next month' })).not.toBeInTheDocument();

    await act(async () => {
      resolve({
        id: 'ann',
        status: 'confirmed',
        invitation: { status: 'sent', email: 'ann@example.com' },
      });
    });

    // The booking exists, so the consumer hears about it — with the request it
    // belongs to — while the confirmation stays out of a flow the user left.
    expect(onBooked).toHaveBeenCalledTimes(1);
    expect(onBooked.mock.calls[0]?.[1].values.email).toBe('ann@example.com');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument(),
    );
    expect(screen.queryByText("You're booked")).not.toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/*  P2 — a reset issued from onBooked must win                                 */
/* -------------------------------------------------------------------------- */

describe('P2: resetting from onBooked', () => {
  it('keeps the widget on the calendar instead of a broken confirmation', async () => {
    const user = userEvent.setup();
    let flow: UseBookingFlowResult | undefined;
    const adapter = createTestAdapter().adapter;

    render(
      <SlotlineProvider
        adapter={adapter}
        {...BASE_PROPS}
        onBooked={() => {
          flow?.actions.reset();
        }}
      >
        <SlotlineView />
        <Capturer
          capture={(next) => {
            flow = next;
          }}
        />
      </SlotlineProvider>,
    );

    await reachDetails(user);
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument(),
    );
    expect(screen.queryByText("You're booked")).not.toBeInTheDocument();
    expect(screen.queryByText('Calendar invite sent to ann@example.com.')).not.toBeInTheDocument();
  });
});
