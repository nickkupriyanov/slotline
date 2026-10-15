import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DURATION_OPTIONS,
  DEFAULT_TIME_FORMAT,
  FALLBACK_LOCALE,
  FALLBACK_TIME_ZONE,
  resolveBookingConfig,
} from './config';
import { DEFAULT_BOOKING_CONTEXT } from './context';
import { defaultMessages } from './i18n';

describe('resolveBookingConfig', () => {
  it('fills in deterministic defaults rather than reading the browser', () => {
    const config = resolveBookingConfig();

    // Server rendering and hydration must agree, so nothing here may depend on the
    // host: a binding applies the browser preference after mounting instead.
    expect(config.locale).toBe(FALLBACK_LOCALE);
    expect(config.timeZone).toBe(FALLBACK_TIME_ZONE);
    expect(config.mode).toBe('booking');
    expect(config.formMode).toBe('collect');
    expect(config.timeFormat).toBe(DEFAULT_TIME_FORMAT);
    expect(config.weekStartsOn).toBe(0);
    expect(config.durationOptions).toEqual([...DEFAULT_DURATION_OPTIONS]);
    expect(config.showDurationSelector).toBe(true);
    expect(config.context).toEqual(DEFAULT_BOOKING_CONTEXT);
    expect(config.messages).toBe(defaultMessages.en);
    expect(config.fields.map((field) => field.name)).toEqual(['name', 'email']);
  });

  it('keeps everything the application passed', () => {
    const config = resolveBookingConfig({
      mode: 'selection',
      formMode: 'skip',
      locale: 'ru',
      timeZone: 'Europe/Berlin',
      timeFormat: '12h',
      weekStartsOn: 1,
      durationOptions: [30],
      showDurationSelector: false,
      title: 'Book a table',
      context: { key: 'clinic-1', data: { room: 3 } },
      capabilities: { idempotentCreate: true, idempotencyRetentionMs: 60_000 },
      defaultValues: { name: 'Ann', email: 'ann@example.com' },
    });

    expect(config).toMatchObject({
      mode: 'selection',
      formMode: 'skip',
      locale: 'ru',
      timeZone: 'Europe/Berlin',
      timeFormat: '12h',
      weekStartsOn: 1,
      durationOptions: [30],
      showDurationSelector: false,
      title: 'Book a table',
      context: { key: 'clinic-1', data: { room: 3 } },
      capabilities: { idempotentCreate: true, idempotencyRetentionMs: 60_000 },
      defaultValues: { name: 'Ann', email: 'ann@example.com' },
    });
    expect(config.messages.title).toBe(defaultMessages.ru.title);
  });

  it('merges copy overrides on top of the locale', () => {
    const config = resolveBookingConfig({ locale: 'ru', messages: { title: 'Своё название' } });

    expect(config.messages.title).toBe('Своё название');
    expect(config.messages.emailLabel).toBe(defaultMessages.ru.emailLabel);
  });

  it('resolves the date limits to day keys in the accepted zone', () => {
    const utc = resolveBookingConfig({
      timeZone: 'UTC',
      minDate: new Date('2026-05-01T23:30:00Z'),
      maxDate: '2026-05-31',
    });

    expect(utc.minDate).toBe('2026-05-01');
    expect(utc.maxDate).toBe('2026-05-31');

    // The same instant is already the next day in Tokyo.
    const tokyo = resolveBookingConfig({
      timeZone: 'Asia/Tokyo',
      minDate: new Date('2026-05-01T23:30:00Z'),
    });

    expect(tokyo.minDate).toBe('2026-05-02');
  });

  it('leaves the limits out rather than setting them to undefined', () => {
    const config = resolveBookingConfig();

    expect('minDate' in config).toBe(false);
    expect('maxDate' in config).toBe(false);
  });

  it('falls back to the defaults when an empty list of options is passed', () => {
    const config = resolveBookingConfig({ durationOptions: [] });

    expect(config.durationOptions).toEqual([...DEFAULT_DURATION_OPTIONS]);
  });

  it('carries a custom field list and a validation hook', () => {
    const validateValues = () => ({ phone: 'Nope' });
    const config = resolveBookingConfig({
      fields: [{ name: 'phone', label: 'Phone', type: 'tel', required: true }],
      validateValues,
    });

    expect(config.fields.map((field) => field.name)).toEqual(['phone']);
    expect(config.validateValues).toBe(validateValues);
  });

  it('does not share state between resolved configurations', () => {
    const first = resolveBookingConfig({ durationOptions: [30] });
    const second = resolveBookingConfig();

    first.durationOptions.push(45);

    expect(second.durationOptions).toEqual([...DEFAULT_DURATION_OPTIONS]);
  });
});
