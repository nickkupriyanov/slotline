import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOKING_FIELDS,
  createEmptyValues,
  resolveBookingFields,
  unmappedFieldNames,
  validateBookingValues,
  visibleFieldErrors,
  type BookingFieldConfig,
} from './fields';
import { defaultMessages } from './i18n';
import type { BookingValues } from './types';

const messages = defaultMessages.en;

const resolve = (fields?: readonly BookingFieldConfig[]) => resolveBookingFields(fields, messages);

describe('resolveBookingFields', () => {
  it('falls back to the built-in pair, labelled from the dictionary', () => {
    const fields = resolve();

    expect(fields.map((field) => field.name)).toEqual(['name', 'email']);
    expect(fields[0]?.label).toBe(messages.nameLabel);
    expect(fields[1]?.label).toBe(messages.emailLabel);
    expect(fields.map((field) => field.type)).toEqual(['text', 'email']);
  });

  it('treats an empty list as "use the defaults"', () => {
    expect(resolve([]).map((field) => field.name)).toEqual(['name', 'email']);
  });

  it('keeps a custom list, its copy and its kind', () => {
    const fields = resolve([
      {
        name: 'phone',
        label: 'Phone',
        type: 'tel',
        required: true,
        hint: 'Include the country code',
      },
      { name: 'consent', type: 'checkbox', required: true },
    ]);

    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ name: 'phone', label: 'Phone', type: 'tel', required: true });
    // A field without a label falls back to its own name rather than to English copy.
    expect(fields[1]).toMatchObject({ name: 'consent', label: 'consent', type: 'checkbox' });
  });

  it('does not mutate the configuration it was given', () => {
    const source: BookingFieldConfig[] = [{ name: 'phone' }];
    resolve(source);

    expect(source[0]).toEqual({ name: 'phone' });
  });
});

describe('createEmptyValues', () => {
  it('starts text-like fields empty and checkboxes unchecked', () => {
    expect(createEmptyValues(DEFAULT_BOOKING_FIELDS)).toEqual({ name: '', email: '' });
    expect(createEmptyValues([{ name: 'consent', type: 'checkbox' }])).toEqual({ consent: false });
  });
});

describe('validateBookingValues', () => {
  const fields = resolve();

  it('requires the built-in pair, with the shipped copy', () => {
    expect(validateBookingValues({ name: '', email: '' }, fields, messages)).toEqual({
      name: messages.nameRequired,
      email: messages.emailRequired,
    });
  });

  it('rejects a malformed email and accepts a good one', () => {
    expect(validateBookingValues({ name: 'Ann', email: 'ann@' }, fields, messages).email).toBe(
      messages.emailInvalid,
    );
    expect(
      validateBookingValues({ name: 'Ann', email: 'ann@example.com' }, fields, messages),
    ).toEqual({});
  });

  it('ignores whitespace when deciding whether a field is empty', () => {
    expect(validateBookingValues({ name: '   ', email: '' }, fields, messages).name).toBe(
      messages.nameRequired,
    );
  });

  it('does not require an optional field', () => {
    const optional = resolve([{ name: 'notes', label: 'Notes' }]);

    expect(validateBookingValues({}, optional, messages)).toEqual({});
  });

  it('names the field when a custom field has no built-in copy', () => {
    const custom = resolve([{ name: 'phone', label: 'Phone number', required: true }]);

    expect(validateBookingValues({}, custom, messages).phone).toBe('Phone number is required.');
  });

  it('prefers the message a custom field carries', () => {
    const custom = resolve([
      { name: 'phone', label: 'Phone', required: true, requiredMessage: 'We need a number' },
    ]);

    expect(validateBookingValues({}, custom, messages).phone).toBe('We need a number');
  });

  it('requires a checkbox to be checked', () => {
    const consent = resolve([
      { name: 'consent', label: 'Consent', type: 'checkbox', required: true },
    ]);

    expect(validateBookingValues({ consent: false }, consent, messages).consent).toBe(
      'Consent is required.',
    );
    expect(validateBookingValues({ consent: true }, consent, messages)).toEqual({});
  });

  it('lets a field rule have the last word on its own field', () => {
    const custom = resolve([
      {
        name: 'name',
        required: true,
        validate: (value) => (value === 'admin' ? 'That name is taken' : undefined),
      },
    ]);

    expect(validateBookingValues({ name: 'admin' }, custom, messages).name).toBe(
      'That name is taken',
    );
  });

  it('lets the application override any field through validateValues', () => {
    const errors = validateBookingValues(
      { name: 'Ann', email: 'ann@example.com' },
      fields,
      messages,
      () => ({
        email: 'This address is blocked',
      }),
    );

    expect(errors.email).toBe('This address is blocked');
  });

  it('passes the edited values to a field rule', () => {
    const custom = resolve([
      {
        name: 'confirm',
        label: 'Confirmation',
        validate: (value, values) =>
          value !== values.email ? 'Addresses do not match' : undefined,
      },
    ]);

    expect(
      validateBookingValues({ email: 'ann@example.com', confirm: 'other' }, custom, messages)
        .confirm,
    ).toBe('Addresses do not match');
  });
});

describe('visibleFieldErrors', () => {
  const validation = { name: 'Enter your name' };
  const server = { phone: 'Invalid number' };

  it('waits for the field to be touched', () => {
    expect(visibleFieldErrors(validation, {}, {})).toEqual({});
    expect(visibleFieldErrors(validation, {}, { name: true })).toEqual(validation);
  });

  it('shows a server error immediately, without waiting for a touch', () => {
    expect(visibleFieldErrors(server, server, {})).toEqual(server);
  });

  it('keeps the server message when a field has both', () => {
    const merged = { ...validation, ...server };

    expect(visibleFieldErrors(merged, server, {})).toEqual(server);
  });
});

describe('unmappedFieldNames', () => {
  it('reports the errors the form cannot place', () => {
    const errors: Record<string, string> = { name: 'Taken', slot: 'Gone' };

    expect(unmappedFieldNames(errors, resolve())).toEqual(['slot']);
  });

  it('reports nothing when every field is known', () => {
    expect(unmappedFieldNames({ name: 'Taken' }, resolve())).toEqual([]);
  });
});

describe('validation of arbitrary values', () => {
  it('keeps working for a payload the form never saw', () => {
    const values: BookingValues = { name: 'Ann', email: 'ann@example.com', extra: 42 };

    expect(validateBookingValues(values, resolve(), messages)).toEqual({});
  });
});
