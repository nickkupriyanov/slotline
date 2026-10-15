import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Slotline } from '../Slotline';
import type { SlotlineProps, BookingAdapter, BookingRequest, BookingResult } from '../types';

/** Fixed calendar so tests never depend on the day they run. */
export const OPEN_DAYS = ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-11', '2026-05-18'];

export const SLOT_STARTS = ['T09:15:00Z', 'T10:00:00Z'] as const;

export function slotsFor(day: string) {
  return SLOT_STARTS.map((suffix) => ({ id: `${day}${suffix}`, start: `${day}${suffix}` }));
}

export interface TestAdapterHandle {
  adapter: BookingAdapter;
  calls: {
    availability: number;
    slots: number;
    bookings: BookingRequest[];
    availabilityQueries: Array<{ from: string; to: string; duration: number }>;
    slotQueries: string[];
  };
}

export function createTestAdapter(overrides: Partial<BookingAdapter> = {}): TestAdapterHandle {
  const calls: TestAdapterHandle['calls'] = {
    availability: 0,
    slots: 0,
    bookings: [],
    availabilityQueries: [],
    slotQueries: [],
  };

  const adapter: BookingAdapter = {
    async getAvailability({ from, to, duration }) {
      calls.availability += 1;
      calls.availabilityQueries.push({ from, to, duration });
      return OPEN_DAYS.filter((day) => day >= from && day <= to).map((date) => ({
        date,
        slotCount: SLOT_STARTS.length,
      }));
    },
    async getSlots({ date }) {
      calls.slots += 1;
      calls.slotQueries.push(date);
      return slotsFor(date);
    },
    async createBooking(request): Promise<BookingResult> {
      calls.bookings.push(request);
      return {
        id: 'booking_1',
        status: 'confirmed',
        invitation: { status: 'sent', email: request.values.email },
      };
    },
    // A deterministic double still declares what a real backend would.
    capabilities: { idempotentCreate: true, idempotencyRetentionMs: 60_000 },
    ...overrides,
  };

  return { adapter, calls };
}

export const BASE_PROPS: Partial<SlotlineProps> = {
  minDate: '2026-05-01',
  maxDate: '2026-05-31',
  timeZone: 'UTC',
  locale: 'en',
  durations: [15, 30, 60],
};

export interface RenderFlowResult {
  calls: TestAdapterHandle['calls'];
  adapter: BookingAdapter;
  rerender: (element: ReactElement) => void;
  container: HTMLElement;
  unmount: () => void;
}

/** Renders the widget with a deterministic adapter and calendar. Pass `adapter` in `props` to override it. */
export function renderFlow(props: Partial<SlotlineProps> = {}): RenderFlowResult {
  const { adapter, calls } = createTestAdapter();
  const { rerender, container, unmount } = render(
    <Slotline adapter={adapter} {...BASE_PROPS} {...props} />,
  );
  return { calls, adapter, rerender, container, unmount };
}
