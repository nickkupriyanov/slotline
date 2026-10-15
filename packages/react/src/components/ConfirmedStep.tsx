import { useClassNames, useFlow } from '../context';
import { CheckIcon } from './icons';

/**
 * Step 4 — confirmation.
 *
 * Every line comes from the view, which itself comes from what the backend
 * reported: the invitation appears only for a status the adapter actually sent.
 */
export function ConfirmedStep() {
  const { snapshot, actions } = useFlow();
  const cls = useClassNames();
  const confirmation = snapshot.view.confirmation;

  if (!confirmation) return null;

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
