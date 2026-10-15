import { format } from '@nickkupriyanov/slotline-core';
import { useClassNames, useUI } from '../context';
import type { DurationFooterPartProps } from '../parts';

/**
 * The duration picker under the calendar.
 *
 * It holds no duration of its own: picking one calls the controller's prepared
 * action, which is what keeps a replacement part honest.
 */
export function DurationFooter({ duration, onSelect }: DurationFooterPartProps) {
  const { messages } = useUI();
  const cls = useClassNames();

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
              onClick={() => onSelect(minutes)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </footer>
  );
}
