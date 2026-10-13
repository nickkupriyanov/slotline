import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slotline } from './index';
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
