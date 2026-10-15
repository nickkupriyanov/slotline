import { useClassNames } from '../context';
import { CalendarIcon, ClockIcon } from './icons';
import type { SummaryPartProps } from '../parts';

/** The recap of the selection, shown before the form and with `formMode: 'skip'`. */
export function Summary({ view }: SummaryPartProps) {
  const cls = useClassNames();

  return (
    <div className={cls('summary')}>
      <span className="sl-summary-icon" aria-hidden="true">
        <CalendarIcon />
      </span>
      <div className="sl-summary-body">
        <p className="sl-summary-date">{view.time.dateLabel}</p>
        <p className="sl-summary-meta">
          <ClockIcon />
          <span>
            {view.time.label} · {view.duration.label}
          </span>
        </p>
      </div>
    </div>
  );
}
