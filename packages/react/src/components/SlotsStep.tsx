import { useClassNames, useFlow, useUI } from '../context';
import { CalendarIcon } from './icons';

const SKELETON_COUNT = 9;

/** Step 2 — the slots of the selected day. */
export function SlotsStep() {
  const { snapshot, actions } = useFlow();
  const { messages } = useUI();
  const cls = useClassNames();
  const Animations = useUI().animations;
  const view = snapshot.view;
  const { slots, time } = view;

  return (
    <div className="sl-slots-step">
      <div className={cls('slotsHeader')}>
        <span className="sl-slots-icon" aria-hidden="true">
          <CalendarIcon />
        </span>
        <h3 className="sl-slots-title">{time.dateLabel}</h3>
        {slots.countLabel ? <span className={cls('slotsCount')}>{slots.countLabel}</span> : null}
      </div>

      {slots.loading ? (
        <div className={cls('slots')} aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div
              key={index}
              className={cls('skeleton')}
              style={{ '--sl-index': index } as React.CSSProperties}
            />
          ))}
        </div>
      ) : null}

      {slots.status === 'error' ? (
        <div className={cls('error')} role="alert">
          <span>{slots.error}</span>
          <button type="button" className="sl-link-button" onClick={actions.reloadSlots}>
            {messages.retry}
          </button>
        </div>
      ) : null}

      {slots.empty ? (
        <div className={cls('empty')}>
          <p className="sl-empty-title">{messages.noSlotsTitle}</p>
          <p className="sl-empty-body">{messages.noSlotsBody}</p>
          <button type="button" className={cls('secondaryButton')} onClick={actions.back}>
            {messages.pickAnotherDay}
          </button>
        </div>
      ) : null}

      {slots.status === 'ready' && slots.count > 0 ? (
        <div className={cls('slots')} role="group" aria-label={slots.label}>
          {slots.items.map((slot, index) => (
            <Animations.Item
              key={slot.id}
              index={index}
              className={cls('slot', slot.selected && 'is-selected')}
              aria-current={slot.selected ? 'true' : undefined}
              aria-label={slot.utcOffsetLabel ? `${slot.label} ${slot.utcOffsetLabel}` : undefined}
              onClick={() => actions.selectSlot(slot)}
            >
              {slot.label}
            </Animations.Item>
          ))}
        </div>
      ) : null}
    </div>
  );
}
