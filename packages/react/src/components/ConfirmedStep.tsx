import { useClassNames, useUI } from '../context';
import { CheckIcon } from './icons';
import type { ConfirmationPartProps } from '../parts';

/**
 * The confirmation.
 *
 * Every line comes from the view, which itself comes from what the backend
 * reported: the invitation appears only for a status the adapter actually sent.
 */
export function ConfirmedStep({ confirmation, actions }: ConfirmationPartProps) {
  const { messages } = useUI();
  const cls = useClassNames();

  // An action appears only when the backend gave the data for it: a missing link is
  // never rendered as an empty block.
  const links: Array<{ href: string; label: string; className: string }> = [];
  if (confirmation.joinUrl) {
    links.push({
      href: confirmation.joinUrl,
      label: messages.confirmationJoinLabel,
      className: cls('submit'),
    });
  }
  for (const [href, label] of [
    [confirmation.calendarUrl, messages.confirmationAddToCalendarLabel],
    [confirmation.rescheduleUrl, messages.confirmationRescheduleLabel],
    [confirmation.cancelUrl, messages.confirmationCancelLabel],
  ] as const) {
    if (href) links.push({ href, label, className: cls('secondaryButton') });
  }

  return (
    <div className={cls('confirmation')}>
      <span className={cls('confirmationIcon')} aria-hidden="true">
        <CheckIcon />
      </span>
      <h3 className={cls('confirmationTitle')}>{confirmation.title}</h3>
      <div className={cls('confirmationText')}>
        <p>{confirmation.summary}</p>
        {confirmation.invitation ? <p>{confirmation.invitation}</p> : null}
      </div>
      {confirmation.location ? (
        <p className="sl-confirmation-place">
          <span className="sl-confirmation-place-label">{messages.confirmationLocationLabel}</span>
          <span>{confirmation.location}</span>
        </p>
      ) : null}

      {confirmation.instructions ? (
        <p className="sl-confirmation-instructions">{confirmation.instructions}</p>
      ) : null}

      {links.length > 0 ? (
        <div className="sl-confirmation-actions">
          {links.map((link) => (
            <a
              key={link.label}
              className={link.className}
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}

      <button type="button" className={cls('secondaryButton')} onClick={actions.reset}>
        {confirmation.bookAnotherLabel}
      </button>
    </div>
  );
}
