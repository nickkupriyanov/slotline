import { useClassNames, useUI } from '../context';
import type { AttemptPartProps } from '../parts';

/**
 * The service screen of an operation: the request has left, and the flow is
 * blocked until its outcome is known.
 *
 * It shows the frozen request rather than the current draft — the user has to see
 * what was actually sent — and offers a repeat only when the adapter promised that
 * repeating is safe.
 */
export function AttemptStep({ attempt, actions }: AttemptPartProps) {
  const { messages } = useUI();
  const cls = useClassNames();

  return (
    <div className={cls('empty')} data-attempt={attempt.status}>
      <p className="sl-empty-title">{attempt.title}</p>
      <p className="sl-empty-body">{attempt.description}</p>
      {attempt.instructions ? <p className="sl-empty-body">{attempt.instructions}</p> : null}

      <div className={cls('summary')} aria-label={attempt.summaryLabel}>
        <div className="sl-summary-body">
          <p className="sl-summary-date">{attempt.summary.dateLabel}</p>
          <p className="sl-summary-meta">
            <span>
              {attempt.summary.timeLabel} · {attempt.summary.durationLabel}
            </span>
          </p>
        </div>
      </div>

      <p className="sl-empty-body">{attempt.retryDescription}</p>

      {attempt.retryAllowed ? (
        <button type="button" className={cls('submit')} onClick={actions.retry}>
          {attempt.retryLabel}
        </button>
      ) : null}

      {attempt.canCheckStatus && actions.checkStatus ? (
        <button type="button" className={cls('secondaryButton')} onClick={actions.checkStatus}>
          {attempt.checkStatusLabel}
        </button>
      ) : null}

      {/* The visible copy stays in the dictionary; nothing renders raw markup. */}
      <span className="sl-visually-hidden">{messages.attemptSummaryLabel}</span>
    </div>
  );
}
