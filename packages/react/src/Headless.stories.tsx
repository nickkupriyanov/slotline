import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { SlotlineProvider } from './Slotline';
import { useSlotlineContext, useUI } from './context';
import { createMockAdapter } from '@nickkupriyanov/slotline-core';

/**
 * The widget owns no data. `useSlotlineContext()` exposes the same snapshot and
 * actions the built-in UI renders, so a fully custom front end is a few dozen
 * lines — and it shows exactly what the shipped widget shows.
 */
function CustomPanel() {
  const { snapshot, actions } = useSlotlineContext();
  const { messages } = useUI();
  const view = snapshot.view;

  const bookableDays = view.month.grid
    .filter((day) => day.startsWith(view.month.key))
    .filter((day) => view.days[day]?.bookable);

  return (
    <div style={{ width: 420, color: 'var(--sl-text)', fontFamily: 'var(--sl-font-family)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button type="button" onClick={actions.previousMonth} style={chipStyle}>
          ←
        </button>
        <strong style={{ fontSize: 16 }}>{view.month.label}</strong>
        <button type="button" onClick={actions.nextMonth} style={chipStyle}>
          →
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>
          {view.duration.label}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {bookableDays.slice(0, 12).map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => actions.selectDate(day)}
            style={{
              ...chipStyle,
              ...(view.selection.date === day ? activeChipStyle : {}),
            }}
          >
            {day.slice(8)} · {view.days[day]?.count ?? 0}
          </button>
        ))}
        {bookableDays.length === 0 && <p style={{ opacity: 0.6 }}>No open days this month.</p>}
      </div>

      {view.selection.date && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 8px' }}>
            {view.time.dateLabel} · {view.slots.loading ? 'Loading…' : view.slots.countLabel}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {view.slots.items.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => actions.selectSlot(slot)}
                style={{ ...chipStyle, ...(slot.selected ? activeChipStyle : {}) }}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {view.selection.slot && view.step === 'details' && (
        <form
          style={{ marginTop: 20, display: 'flex', gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            void actions.submit();
          }}
        >
          {view.form.fields.map((field) => (
            <input
              key={field.name}
              aria-label={field.label}
              placeholder={field.label}
              value={String(view.form.values[field.name] ?? '')}
              onChange={(event) => actions.setValues({ [field.name]: event.target.value })}
              onBlur={() => actions.touchField(field.name)}
              style={{ ...inputStyle, flex: 1 }}
            />
          ))}
          <button
            type="submit"
            style={{ ...chipStyle, ...activeChipStyle }}
            disabled={!view.actions.canSubmit}
          >
            {view.form.submitting ? '…' : 'Go'}
          </button>
        </form>
      )}

      {view.form.submitError && (
        <p style={{ marginTop: 12, fontSize: 13 }}>{view.form.submitError}</p>
      )}

      {view.confirmation && (
        <p style={{ marginTop: 18, fontSize: 14 }}>{view.confirmation.summary}</p>
      )}

      {view.attempt && (
        <div style={{ marginTop: 18, fontSize: 13 }}>
          <strong>{view.attempt.title}</strong>
          <p style={{ opacity: 0.7 }}>{view.attempt.description}</p>
          {view.actions.canRetry && (
            <button
              type="button"
              onClick={actions.retry}
              style={{ ...chipStyle, ...activeChipStyle }}
            >
              {view.attempt.retryLabel}
            </button>
          )}
        </div>
      )}

      <p style={{ marginTop: 18, fontSize: 12, opacity: 0.5 }}>{messages.progressLabel}</p>
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
          'Build your own UI on the same controller: `useSlotlineContext()` returns one snapshot and the actions, and everything rendered comes from `snapshot.view`.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const CustomUi: Story = {};
