import { format } from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow } from '../context';
import { CheckIcon } from './icons';

/** Step 4 — confirmation. */
export function ConfirmedStep() {
  const { state, messages, selectedDateLabel, selectedTimeLabel, durationLabel, actions } =
    useFlow();
  const cls = useClassNames();

  const inviteeEmail =
    (typeof state.result?.inviteeEmail === 'string' ? state.result.inviteeEmail : undefined) ??
    state.details.email;

  return (
    <div className={cls('confirmation')}>
      <span className={cls('confirmationIcon')} aria-hidden="true">
        <CheckIcon />
      </span>
      <h3 className={cls('confirmationTitle')}>{messages.bookedTitle}</h3>
      <div className={cls('confirmationText')}>
        <p>
          {format(messages.bookedSummary, {
            date: selectedDateLabel,
            time: selectedTimeLabel,
            duration: durationLabel,
          })}
        </p>
        <p>{format(messages.inviteSent, { email: inviteeEmail })}</p>
      </div>
      <button type="button" className={cls('secondaryButton')} onClick={actions.reset}>
        {messages.bookAnother}
      </button>
    </div>
  );
}
