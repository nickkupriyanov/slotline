import { useClassNames } from '../context';
import { CheckIcon } from './icons';
import type { ConfirmationPartProps } from '../parts';

/**
 * The confirmation.
 *
 * Every line comes from the view, which itself comes from what the backend
 * reported: the invitation appears only for a status the adapter actually sent.
 */
export function ConfirmedStep({ confirmation, actions }: ConfirmationPartProps) {
  const cls = useClassNames();

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
      <button type="button" className={cls('secondaryButton')} onClick={actions.reset}>
        {confirmation.bookAnotherLabel}
      </button>
    </div>
  );
}
