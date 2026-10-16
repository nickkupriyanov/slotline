import type { Meta, StoryObj } from '@storybook/react-vite';
import { createMockAdapter, type BookingAdapter } from '@nickkupriyanov/slotline-core';
import { Slotline, type BookingFieldConfig, type SlotPartProps } from './index';
import type { SlotlineTheme } from './types';

const adapter: BookingAdapter = createMockAdapter({ horizonDays: 90 });

/**
 * A slot drawn as a pill.
 *
 * The part receives the prepared button props — the pick handler, the selection
 * state, the accessible name and the animation hook — and spreads them on its own
 * element, so focus, keyboard navigation and the accessible name stay the library's
 * while the appearance is the application's.
 */
function PillSlot({ slot, slotProps, children }: SlotPartProps) {
  return (
    <button
      {...slotProps}
      style={{
        ...slotProps.style,
        borderRadius: 999,
        padding: '10px 16px',
        font: 'inherit',
        cursor: 'pointer',
        background: slot.selected ? 'var(--sl-accent)' : 'transparent',
        border: slot.selected
          ? '1px solid var(--sl-accent)'
          : '1px solid var(--sl-accent-ink, #888)',
        color: slot.selected ? 'var(--sl-accent-ink, #fff)' : 'inherit',
      }}
    >
      {children}
      {slot.utcOffsetLabel ? (
        <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.65 }}>{slot.utcOffsetLabel}</span>
      ) : null}
    </button>
  );
}

/** Two fields instead of the built-in pair, one of them with its own rule. */
const phoneFields: readonly BookingFieldConfig[] = [
  {
    name: 'name',
    label: 'Your name',
    required: true,
    placeholder: 'Ann',
    hint: 'As it should appear on the record.',
  },
  {
    name: 'phone',
    label: 'Phone',
    type: 'tel',
    required: true,
    placeholder: '+49 30 1234567',
    hint: 'For the day-of call.',
    validate: (value) =>
      String(value ?? '').replace(/\D/g, '').length < 7
        ? 'A phone number needs at least seven digits.'
        : undefined,
  },
];

const meta: Meta<typeof Slotline> = {
  title: 'Widget/Extensions',
  component: Slotline,
  parameters: {
    docs: {
      description: {
        component:
          'Two ways to fit the widget to an application: replacing a part, and configuring the form. Both are independent of `classNames`, which keeps working on top.',
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
    components: { control: false },
    fields: { control: false },
    validateValues: { control: false },
    theme: { control: 'inline-radio', options: ['dark', 'light', 'system'] },
  },
  render: (args, context) => (
    <Slotline {...args} theme={(context.globals.theme as SlotlineTheme) ?? args.theme} />
  ),
};

export default meta;
type Story = StoryObj<typeof meta>;

export const CustomPart: Story = {
  name: 'Replaced part — your own offer button',
  args: { components: { Slot: PillSlot } },
  parameters: {
    docs: {
      description: {
        story:
          'Only the parts the application passes are replaced; everything else keeps its default, and the defaults are exported so a part can be wrapped rather than rewritten. Here the offer button is redrawn while `slotProps` keeps the behaviour.',
      },
    },
  },
};

export const CustomFields: Story = {
  name: 'Configured form — phone instead of email',
  args: {
    fields: phoneFields,
    validateValues: (values) =>
      values.name === 'admin' ? { name: 'Pick a name a human would use.' } : undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The field list is data: replace it to drop the email, add a phone number, or ask an extra question. `validate` belongs to the field and `validateValues` to the application; both land in the same error area, and server errors are bound to their fields.',
      },
    },
  },
};
