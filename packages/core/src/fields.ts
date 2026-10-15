/**
 * The form model.
 *
 * A field describes its own name, copy, kind and rules; the flow stores values as
 * a plain object and validates it against the same list. The built-in form is just
 * the default list, so a consumer that replaces it uses exactly the same mechanism
 * — there is no second source of truth for "the fields" and "their validation".
 */
import { format } from './i18n';
import type { BookingValues, SlotlineMessages } from './types';

export type BookingFieldType =
  'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'checkbox';

export interface BookingFieldOption {
  value: string;
  label: string;
}

export interface BookingFieldConfig {
  name: string;
  /** Visible and accessible label. The built-in fields take theirs from the dictionary. */
  label?: string;
  /** Default: `'text'`. */
  type?: BookingFieldType;
  required?: boolean;
  /** Message for an empty required field whose built-in copy does not apply. */
  requiredMessage?: string;
  placeholder?: string;
  /** Short explanation rendered under the control. */
  hint?: string;
  /** Choices for `type: 'select'`. */
  options?: BookingFieldOption[];
  /** Last word on a single field: its message wins over the built-in rules. */
  validate?(value: unknown, values: BookingValues): string | undefined;
}

/** A field with its label and type filled in — what a binding renders. */
export interface ResolvedBookingField extends Omit<BookingFieldConfig, 'label' | 'type'> {
  label: string;
  type: BookingFieldType;
}

/** The built-in form: name + email. */
export const DEFAULT_BOOKING_FIELDS: readonly BookingFieldConfig[] = [
  { name: 'name', required: true },
  { name: 'email', type: 'email', required: true },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function labelKeyOf(name: string): 'nameLabel' | 'emailLabel' | undefined {
  if (name === 'name') return 'nameLabel';
  if (name === 'email') return 'emailLabel';
  return undefined;
}

/** Fills in the label and the type, and falls back to the built-in pair. */
export function resolveBookingFields(
  fields: readonly BookingFieldConfig[] | undefined,
  messages: SlotlineMessages,
): ResolvedBookingField[] {
  const source = fields && fields.length > 0 ? fields : DEFAULT_BOOKING_FIELDS;
  return source.map((field) => {
    const key = labelKeyOf(field.name);
    return {
      ...field,
      type: field.type ?? 'text',
      label: field.label ?? (key ? String(messages[key]) : field.name),
    };
  });
}

/** Empty values for a field list: `''` for text-like fields, `false` for checkboxes. */
export function createEmptyValues(
  fields: readonly { name: string; type?: BookingFieldType }[],
): BookingValues {
  const values: BookingValues = {};
  for (const field of fields) values[field.name] = field.type === 'checkbox' ? false : '';
  return values;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

function requiredMessageOf(field: ResolvedBookingField, messages: SlotlineMessages): string {
  if (field.requiredMessage) return field.requiredMessage;
  if (field.name === 'name') return messages.nameRequired;
  if (field.name === 'email') return messages.emailRequired;
  return format(messages.fieldRequired, { field: field.label });
}

/**
 * Validates typed values against the field list.
 *
 * Field rules come first, then the application's own `validateValues`, which has
 * the last word on any field it names — it knows the domain.
 *
 * The `number` kind deliberately has no built-in format rule: a numeric input
 * hands over a string, and only the application knows what counts as a valid
 * number here, so it belongs in `validate`.
 */
export function validateBookingValues(
  values: BookingValues,
  fields: readonly ResolvedBookingField[],
  messages: SlotlineMessages,
  validateValues?: (values: BookingValues) => Record<string, string> | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = values[field.name];

    if (field.type === 'checkbox') {
      if (field.required && value !== true) errors[field.name] = requiredMessageOf(field, messages);
    } else if (field.required && isEmpty(value)) {
      errors[field.name] = requiredMessageOf(field, messages);
    } else if (
      !isEmpty(value) &&
      field.type === 'email' &&
      typeof value === 'string' &&
      !EMAIL_RE.test(value.trim())
    ) {
      errors[field.name] = messages.emailInvalid;
    }

    const custom = field.validate?.(value, values);
    if (custom) errors[field.name] = custom;
  }

  const external = validateValues?.(values);
  if (external) Object.assign(errors, external);

  return errors;
}

/**
 * Errors that should be visible right now.
 *
 * A server-side error appears immediately — the user has just submitted — while a
 * validation error waits until the field has been touched.
 */
export function visibleFieldErrors(
  errors: Record<string, string>,
  serverErrors: Record<string, string>,
  touched: Record<string, boolean>,
): Record<string, string> {
  const visible: Record<string, string> = {};
  for (const [name, message] of Object.entries(errors)) {
    if (name in serverErrors || touched[name]) visible[name] = message;
  }
  return visible;
}

/** Values with an error the form cannot place on a field. */
export function unmappedFieldNames(
  errors: Record<string, string>,
  fields: readonly ResolvedBookingField[],
): string[] {
  const known = new Set(fields.map((field) => field.name));
  return Object.keys(errors).filter((name) => !known.has(name));
}
