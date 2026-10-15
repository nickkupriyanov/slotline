import { format } from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow, useUI } from '../context';

/** The duration picker shown under the calendar, mirroring the reference design. */
export function DurationFooter() {
  const { snapshot, actions } = useFlow();
  const { messages } = useUI();
  const cls = useClassNames();
  const duration = snapshot.view.duration;

  if (!duration.showSelector) return null;

  return (
    <footer className={cls('footer')}>
      {/* The group carries the accessible name, so the visible caption is decorative. */}
      <span className="sl-duration-label" aria-hidden="true">
        {messages.durationLabel}
      </span>
      <div className="sl-duration-group" role="radiogroup" aria-label={messages.durationGroupLabel}>
        {duration.options.map((minutes) => {
          const active = minutes === duration.current;
          const label = format(messages.duration, { count: minutes });
          return (
            <button
              key={minutes}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              className="sl-duration-pill"
              data-state={active ? 'active' : 'idle'}
              onClick={() => actions.setDuration(minutes)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </footer>
  );
}
