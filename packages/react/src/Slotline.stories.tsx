import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slotline, type BookingSelection, type BookingValues } from './index';
import { createMockAdapter } from '@nickkupriyanov/slotline-core';
import { Slotline as MotionSlotline } from './motion';
import type { SlotlineTheme, BookingAdapter } from './types';

const adapter = createMockAdapter({ horizonDays: 90 });

/** Every day looks free until you pick one — good for demoing the empty state. */
const emptySlotsAdapter: BookingAdapter = {
  ...createMockAdapter({ horizonDays: 90 }),
  async getSlots() {
    return [];
  },
};

const brokenAdapter: BookingAdapter = {
  ...createMockAdapter({ horizonDays: 90 }),
  async createBooking() {
    throw new Error('Google Calendar is unreachable');
  },
};

const meta: Meta<typeof Slotline> = {
  title: 'Widget/Slotline',
  component: Slotline,
  parameters: {
    docs: {
      description: {
        component:
          'The ready-made four-step widget. Use the theme toolbar to switch the designed dark and light palettes.',
      },
    },
  },
  args: {
    adapter,
    locale: 'en',
    durations: [15, 30, 60],
    defaultDuration: 15,
  },
  argTypes: {
    adapter: { control: false },
    theme: { control: 'inline-radio', options: ['dark', 'light', 'system'] },
    locale: { control: 'inline-radio', options: ['en', 'ru'] },
    durations: { control: 'object' },
    weekStartsOn: { control: 'inline-radio', options: [0, 1] },
    timeZone: { control: 'text' },
  },
  render: (args, context) => (
    <Slotline {...args} theme={(context.globals.theme as SlotlineTheme) ?? args.theme} />
  ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'Full flow',
};

export const Russian: Story = {
  args: { locale: 'ru' },
};

export const MondayFirst: Story = {
  args: { weekStartsOn: 1 },
};

export const TwoDurations: Story = {
  args: { durations: [30, 60], defaultDuration: 30 },
};

export const FixedTimeZone: Story = {
  args: {
    timeZone: 'Asia/Tokyo',
    adapter: createMockAdapter({ horizonDays: 90, timeZone: 'Asia/Tokyo' }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Availability is generated in Asia/Tokyo and rendered in the same zone — the slot times are instants, not wall-clock strings.',
      },
    },
  },
};

export const MotionSprings: Story = {
  name: 'Motion springs (optional peer)',
  render: (args, context) => (
    <MotionSlotline {...args} theme={(context.globals.theme as SlotlineTheme) ?? args.theme} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `@nickkupriyanov/slotline-react/motion` entry swaps the CSS kit for spring transitions and staggered slot reveals. Requires the optional `motion` peer dependency.',
      },
    },
  },
};

export const CustomAccent: Story = {
  name: 'Themed with CSS variables',
  decorators: [
    (Story) => (
      <div
        style={
          {
            '--sl-accent': '#7c5cff',
            '--sl-accent-hover': '#8f74ff',
            '--sl-accent-ink': '#ab9dff',
            '--sl-accent-soft': 'rgba(124, 92, 255, 0.18)',
            '--sl-accent-soft-strong': 'rgba(124, 92, 255, 0.3)',
            '--sl-radius-card': '18px',
            '--sl-width': '440px',
          } as React.CSSProperties
        }
      >
        <Story />
      </div>
    ),
  ],
};

export const Narrow: Story = {
  name: 'Narrow container',
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};

export const LoadingSlots: Story = {
  name: 'State — slow backend',
  args: { adapter: createMockAdapter({ horizonDays: 90, latency: 1400 }) },
};

export const EmptyDay: Story = {
  name: 'State — no slots left',
  args: { adapter: emptySlotsAdapter },
};

export const SubmissionFailure: Story = {
  name: 'State — booking rejected',
  args: { adapter: brokenAdapter },
};

export const SelectionMode: Story = {
  name: 'Selection mode — the application owns the choice',
  args: { mode: 'selection' },
  render: (args, context) => {
    const [choice, setChoice] = useState<BookingSelection>(null);
    return (
      <div>
        <Slotline
          {...args}
          theme={(context.globals.theme as SlotlineTheme) ?? args.theme}
          selection={choice}
          onSelectionChange={(next) => setChoice(next)}
        />
        <p
          style={{
            marginTop: 12,
            font: '13px/1.5 ui-sans-serif, system-ui',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(148, 163, 184, 0.16)',
            maxWidth: 400,
          }}
        >
          {choice
            ? `Proposed: ${choice.date}${choice.slot ? ' · an offer' : ' · the day only'}`
            : 'Nothing proposed yet — pick a day, then an offer.'}
        </p>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '`mode="selection"` ends the flow at the offer: no form, no record, and an adapter that only answers availability. The widget reports what the user proposed and applies whatever comes back, so the application is the one deciding.',
      },
    },
  },
};

export const FormSkipped: Story = {
  name: 'Form skipped — values owned by the application',
  args: { formMode: 'skip' },
  render: (args, context) => {
    const [values, setValues] = useState<BookingValues>({ name: 'Ann', email: 'ann@example.com' });
    return (
      <div>
        <Slotline
          {...args}
          theme={(context.globals.theme as SlotlineTheme) ?? args.theme}
          values={values}
          onValuesChange={(next) => setValues(next)}
        />
        <p
          style={{
            marginTop: 12,
            font: '13px/1.5 ui-sans-serif, system-ui',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(148, 163, 184, 0.16)',
            maxWidth: 400,
          }}
        >
          {`Application values: ${String(values.name ?? '')} · ${String(values.email ?? '')}`}
        </p>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          '`formMode="skip"` keeps the recap and the confirmation and leaves the values to the application: the details step shows no fields, and the request carries the controlled `values` unchanged.',
      },
    },
  },
};

export const ExtendedConfirmation: Story = {
  name: 'Confirmation — place, instructions and links',
  args: {
    adapter: createMockAdapter({
      horizonDays: 90,
      resultExtras: {
        location: 'Studio 2, Torstraße 14',
        instructions: 'Ring the bell twice and ask for Ann.',
        joinUrl: 'https://meet.example.com/slotline-demo',
        calendarUrl: 'https://calendar.example.com/slotline-demo.ics',
        rescheduleUrl: 'https://app.example.com/bookings/demo/reschedule',
        cancelUrl: 'https://app.example.com/bookings/demo/cancel',
      },
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Every line of the confirmation comes from the record the backend returned — the place, the instructions and one action per link that exists. Anything absent renders nothing, so a booking without a place shows no empty block. Walk the flow to reach it. The invitation line follows an explicit status: `sent`, `pending` or `failed`.',
      },
    },
  },
};

export const AdaptiveLayout: Story = {
  name: 'Adaptive layout — calendar beside the offers',
  args: { layout: 'adaptive' },
  decorators: [
    (Story) => (
      <div style={{ width: 900 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          '`layout="adaptive"` lets the card grow to `--sl-width-adaptive` and, past 720px of container, the time step re-composes into one grid with two columns: the calendar on the left, the offers on the right. Below that the same step is the compact one — the decision is the container\'s, not the viewport\'s.',
      },
    },
  },
};

export const TimeZoneControls: Story = {
  name: 'Time zone and 12/24 controls',
  args: {
    timeZone: 'Europe/Berlin',
    timeZones: ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'],
    showTimeZoneSelector: true,
    showTimeFormatSelector: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Both controls are off by default and belong to the application: the time zone selector (with search) and the 12/24 switch. Changing the format is presentation only, while changing the zone re-reads the day — the same instant can fall on another date in the new zone.',
      },
    },
  },
};

export const UnknownOutcome: Story = {
  name: 'Attempt — unknown outcome, safe retry',
  args: {
    adapter: createMockAdapter({
      horizonDays: 90,
      idempotentCreate: true,
      createBookingFailures: [{ code: 'UNKNOWN_OUTCOME' }],
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'The creation leaves and its answer never arrives. The widget does not guess: it freezes the request that was sent, shows it, and offers a repeat that carries the same idempotency key. A repeat is offered only because the adapter promised `capabilities.idempotentCreate`. Walk the flow to reach it.',
      },
    },
  },
};
