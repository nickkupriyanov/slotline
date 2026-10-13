import { useId } from 'react';
import { useClassNames, useFlow } from '../context';
import { ArrowRightIcon, CalendarIcon, ClockIcon, SpinnerIcon } from './icons';

interface FieldProps {
  name: 'name' | 'email';
  label: string;
  value: string;
  type?: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}

function Field({
  name,
  label,
  value,
  type = 'text',
  error,
  disabled,
  autoFocus,
  onChange,
  onBlur,
}: FieldProps) {
  const cls = useClassNames();
  const errorId = useId();

  return (
    <div className={cls('field')} data-invalid={error ? 'true' : undefined}>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={type === 'email' ? 'email' : undefined}
        autoComplete={name === 'email' ? 'email' : 'name'}
        className={cls('input')}
        // The reference design has no visible labels; the accessible name comes
        // from aria-label so the placeholder can stay pure decoration.
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder={label}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {error ? (
        <p className="sl-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Step 3 — recap of the selection plus the two required fields. */
export function DetailsStep() {
  const {
    state,
    messages,
    selectedDateLabel,
    selectedTimeLabel,
    durationLabel,
    actions,
    shownFieldErrors,
    detailsValid,
  } = useFlow();
  const cls = useClassNames();
  const submitting = state.submitStatus === 'submitting';

  return (
    <div className="sl-details-step">
      <div className={cls('summary')}>
        <span className="sl-summary-icon" aria-hidden="true">
          <CalendarIcon />
        </span>
        <div className="sl-summary-body">
          <p className="sl-summary-date">{selectedDateLabel}</p>
          <p className="sl-summary-meta">
            <ClockIcon />
            <span>
              {selectedTimeLabel} · {durationLabel}
            </span>
          </p>
        </div>
      </div>

      <form
        className={cls('form')}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void actions.submit();
        }}
      >
        <Field
          name="name"
          label={messages.nameLabel}
          value={state.details.name}
          error={shownFieldErrors.name}
          disabled={submitting}
          autoFocus
          onChange={(value) => actions.setDetails({ name: value })}
          onBlur={() => actions.touchField('name')}
        />
        <Field
          name="email"
          label={messages.emailLabel}
          type="email"
          value={state.details.email}
          error={shownFieldErrors.email}
          disabled={submitting}
          onChange={(value) => actions.setDetails({ email: value })}
          onBlur={() => actions.touchField('email')}
        />

        {state.submitError ? (
          <div className={cls('error')} role="alert">
            <span>{state.submitError}</span>
            <button
              type="button"
              className="sl-link-button"
              onClick={() => void actions.submit()}
            >
              {messages.retry}
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          className={cls('submit')}
          disabled={submitting || !detailsValid}
          data-loading={submitting ? 'true' : undefined}
        >
          <span>{submitting ? messages.confirming : messages.confirm}</span>
          {submitting ? (
            <SpinnerIcon className="sl-spinner" />
          ) : (
            <ArrowRightIcon className="sl-submit-arrow" />
          )}
        </button>
      </form>
    </div>
  );
}
