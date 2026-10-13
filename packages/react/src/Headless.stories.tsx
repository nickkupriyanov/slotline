import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { SlotlineProvider } from './Slotline';
import { useSlotlineContext } from './context';
import { createMockAdapter, format, formatTime } from '@nickkupriyanov/slotline-core';

/**
 * The widget owns no data. `useSlotlineContext()` exposes the same state and
 * actions the built-in UI uses, so a fully custom front end is a few dozen lines.
 */
function CustomPanel() {
  const {
    state,
    messages,
    locale,
    timeZone,
    monthLabel,
    monthGrid,
    selectedDateLabel,
    durationLabel,
    isDayBookable,
    availabilityOf,
    actions,
  } = useSlotlineContext();

  const bookableDays = monthGrid.filter((day) => day.startsWith(state.month) && isDayBookable(day));

  return (
    <div style={{ width: 420, color: 'var(--sl-text)', fontFamily: 'var(--sl-font-family)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button type="button" onClick={actions.previousMonth} style={chipStyle}>
          ←
        </button>
        <strong style={{ fontSize: 16 }}>{monthLabel}</strong>
        <button type="button" onClick={actions.nextMonth} style={chipStyle}>
          →
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>{durationLabel}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {bookableDays.slice(0, 12).map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => actions.selectDate(day)}
            style={{ ...chipStyle, ...(state.selectedDate === day ? activeChipStyle : {}) }}
          >
            {day.slice(8)} · {availabilityOf(day)?.slotCount ?? 0}
          </button>
        ))}
        {bookableDays.length === 0 && <p style={{ opacity: 0.6 }}>No open days this month.</p>}
      </div>

      {state.selectedDate && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 8px' }}>
            {selectedDateLabel} ·{' '}
            {state.slotsStatus === 'loading'
              ? 'Loading…'
              : format(messages.slotsCount, { count: state.slots.length })}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {state.slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                onClick={() => actions.selectSlot(slot)}
                style={{
                  ...chipStyle,
                  ...(state.selectedSlot?.start === slot.start ? activeChipStyle : {}),
                }}
              >
                {formatTime(slot.start, timeZone, locale)}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.selectedSlot && (
        <form
          style={{ marginTop: 20, display: 'flex', gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            void actions.submit();
          }}
        >
          <input
            aria-label={messages.nameLabel}
            placeholder={messages.nameLabel}
            value={state.details.name}
            onChange={(event) => actions.setDetails({ name: event.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            aria-label={messages.emailLabel}
            placeholder={messages.emailLabel}
            value={state.details.email}
            onChange={(event) => actions.setDetails({ email: event.target.value })}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="submit"
            style={{ ...chipStyle, ...activeChipStyle }}
            disabled={!state.selectedSlot}
          >
            {state.submitStatus === 'submitting' ? '…' : 'Go'}
          </button>
        </form>
      )}

      {state.step === 'confirmed' && (
        <p style={{ marginTop: 18, fontSize: 14 }}>
          {format(messages.bookedSummary, {
            date: selectedDateLabel,
            time: state.selectedSlot ? formatTime(state.selectedSlot.start, timeZone, locale) : '',
            duration: durationLabel,
          })}
        </p>
      )}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: 'inherit',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  cursor: 'pointer',
};

const activeChipStyle: React.CSSProperties = {
  color: '#fff',
  background: 'var(--sl-accent)',
  borderColor: 'transparent',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  color: 'inherit',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
};

function HeadlessDemo() {
  const adapter = useMemo(() => createMockAdapter({ horizonDays: 90 }), []);
  return (
    <SlotlineProvider adapter={adapter} theme="dark" locale="en">
      <CustomPanel />
    </SlotlineProvider>
  );
}

const meta: Meta<typeof HeadlessDemo> = {
  title: 'Headless/Custom UI',
  component: HeadlessDemo,
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component:
          'Build your own UI on the same state machine: `useSlotlineContext()` returns the state, messages, formatters and actions.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const CustomUi: Story = {};
