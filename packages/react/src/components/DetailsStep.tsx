import { useId } from 'react';
import type { BookingValues, ResolvedBookingField } from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow, useUI } from '../context';
import { ArrowRightIcon, CalendarIcon, ClockIcon, SpinnerIcon } from './icons';

interface FieldProps {
  field: ResolvedBookingField;
  value: unknown;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

/** Browser hints for the fields the widget knows by name. */
function autoCompleteOf(name: string): string | undefined {
  if (name === 'name') return 'name';
  if (name === 'email') return 'email';
  if (name === 'tel' || name === 'phone') return 'tel';
  return undefined;
}

function inputTypeOf(field: ResolvedBookingField): string {
  if (field.type === 'email') return 'email';
  if (field.type === 'tel') return 'tel';
  if (field.type === 'number') return 'number';
  return 'text';
}

function textOf(value: unknown): string {
  if (value === undefined || value === null || typeof value === 'boolean') return '';
  return String(value);
}

/**
 * One field of the form. The kind comes from the configuration, so a replaced
 * field list renders through the same markup as the built-in pair.
 */
function Field({ field, value, error, disabled, autoFocus, onChange, onBlur }: FieldProps) {
  const cls = useClassNames();
  const generatedId = useId();
  const errorId = `${generatedId}-error`;
  const hintId = `${generatedId}-hint`;

  // The reference design has no visible labels; the accessible name comes from
  // aria-label so the placeholder can stay pure decoration.
  const shared = {
    id: generatedId,
    name: field.name,
    'aria-label': field.label,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? errorId : field.hint ? hintId : undefined,
    disabled,
  };

  return (
    <div className={cls('field')} data-invalid={error ? 'true' : undefined}>
      {field.type === 'textarea' ? (
        <textarea
          {...shared}
          className={cls('input')}
          placeholder={field.placeholder ?? field.label}
          value={textOf(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : field.type === 'select' ? (
        <select
          {...shared}
          className={cls('input')}
          value={textOf(value)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        >
          <option value="">{field.placeholder ?? ''}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <label className="sl-checkbox">
          <input
            {...shared}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            onBlur={onBlur}
          />
          <span>{field.label}</span>
        </label>
      ) : (
        <input
          {...shared}
          type={inputTypeOf(field)}
          inputMode={
            field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email' : undefined
          }
          autoComplete={autoCompleteOf(field.name)}
          className={cls('input')}
          placeholder={field.placeholder ?? field.label}
          value={textOf(value)}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      )}

      {field.hint && !error ? (
        <p className="sl-field-hint" id={hintId}>
          {field.hint}
        </p>
      ) : null}

      {error ? (
        <p className="sl-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Step 3 — recap of the selection plus the configured fields. */
export function DetailsStep() {
  const { snapshot, actions } = useFlow();
  const { messages } = useUI();
  const cls = useClassNames();
  const view = snapshot.view;
  const form = view.form;

  return (
    <div className="sl-details-step">
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

      <form
        className={cls('form')}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void actions.submit();
        }}
      >
        {form.fields.map((field, index) => (
          <Field
            key={field.name}
            field={field}
            value={form.values[field.name]}
            error={form.visibleErrors[field.name]}
            disabled={form.submitting}
            autoFocus={index === 0}
            onChange={(value) => actions.setValues({ [field.name]: value } as BookingValues)}
            onBlur={() => actions.touchField(field.name)}
          />
        ))}

        {form.formError ? (
          <div className={cls('error')} role="alert">
            <span>{form.formError}</span>
          </div>
        ) : null}

        {form.submitError ? (
          <div className={cls('error')} role="alert">
            <span>{form.submitError}</span>
            <button type="button" className="sl-link-button" onClick={() => void actions.submit()}>
              {messages.retry}
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          className={cls('submit')}
          disabled={form.submitting}
          data-loading={form.submitting ? 'true' : undefined}
        >
          <span>{form.submitLabel}</span>
          {form.submitting ? (
            <SpinnerIcon className="sl-spinner" />
          ) : (
            <ArrowRightIcon className="sl-submit-arrow" />
          )}
        </button>
      </form>
    </div>
  );
}
