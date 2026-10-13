import { format, formatTime } from '@nickkupriyanov/slotline-core';
import { useClassNames, useAnimations, useFlow } from '../context';
import { CalendarIcon } from './icons';

const SKELETON_COUNT = 9;

/** Step 2 — the slots of the selected day. */
export function SlotsStep() {
  const { state, messages, locale, timeZone, selectedDateLabel, actions } = useFlow();
  const cls = useClassNames();
  const { Item } = useAnimations();
  const loading = state.slotsStatus === 'loading' || state.slotsStatus === 'idle';

  return (
    <div className="sl-slots-step">
      <div className={cls('slotsHeader')}>
        <span className="sl-slots-icon" aria-hidden="true">
          <CalendarIcon />
        </span>
        <h3 className="sl-slots-title">{selectedDateLabel}</h3>
        {state.slotsStatus === 'ready' ? (
          <span className={cls('slotsCount')}>
            {format(messages.slotsCount, { count: state.slots.length })}
          </span>
        ) : null}
      </div>

      {loading ? (
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

      {state.slotsStatus === 'error' ? (
        <div className={cls('error')} role="alert">
          <span>{state.slotsError}</span>
          <button type="button" className="sl-link-button" onClick={actions.reloadSlots}>
            {messages.retry}
          </button>
        </div>
      ) : null}

      {state.slotsStatus === 'ready' && state.slots.length === 0 ? (
        <div className={cls('empty')}>
          <p className="sl-empty-title">{messages.noSlotsTitle}</p>
          <p className="sl-empty-body">{messages.noSlotsBody}</p>
          <button type="button" className={cls('secondaryButton')} onClick={actions.back}>
            {messages.pickAnotherDay}
          </button>
        </div>
      ) : null}

      {state.slotsStatus === 'ready' && state.slots.length > 0 ? (
        <div className={cls('slots')} role="group" aria-label={messages.slotsLabel}>
          {state.slots.map((slot, index) => {
            const selected = state.selectedSlot?.start === slot.start;
            return (
              <Item
                key={slot.start}
                index={index}
                className={cls('slot', selected && 'is-selected')}
                aria-current={selected ? 'true' : undefined}
                onClick={() => actions.selectSlot(slot)}
              >
                {formatTime(slot.start, timeZone, locale)}
              </Item>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
