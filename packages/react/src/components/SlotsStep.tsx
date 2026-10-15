import { useClassNames, useComponents, useFlow, useUI } from '../context';
import { CalendarIcon } from './icons';

/** Step 2 — the slots of the selected day. */
export function SlotsStep() {
  const { snapshot, actions } = useFlow();
  const { messages } = useUI();
  const { Empty, Error, Loading, Slot } = useComponents();
  const cls = useClassNames();
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

      {slots.loading ? <Loading /> : null}

      {slots.status === 'error' ? (
        <Error
          message={slots.error ?? ''}
          retryLabel={messages.retry}
          onRetry={actions.reloadSlots}
        />
      ) : null}

      {slots.empty ? (
        <Empty
          title={messages.noSlotsTitle}
          body={messages.noSlotsBody}
          action={{ label: messages.pickAnotherDay, onClick: actions.back }}
        />
      ) : null}

      {slots.status === 'ready' && slots.count > 0 ? (
        <div className={cls('slots')} role="group" aria-label={slots.label}>
          {slots.items.map((slot, index) => (
            <Slot
              key={slot.id}
              slot={slot}
              index={index}
              slotProps={{
                type: 'button',
                className: cls('slot', 'sl-stagger-item', slot.selected && 'is-selected'),
                style: { '--sl-index': index } as React.CSSProperties,
                'aria-current': slot.selected ? 'true' : undefined,
                'aria-label': slot.utcOffsetLabel
                  ? `${slot.label} ${slot.utcOffsetLabel}`
                  : undefined,
                onClick: () => actions.selectSlot(slot),
              }}
            >
              {slot.label}
            </Slot>
          ))}
        </div>
      ) : null}
    </div>
  );
}
