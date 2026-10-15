import { describe, expect, it } from 'vitest';
import { defaultMessages, format, resolveMessageLocale, resolveMessages } from './i18n';
import type { SlotlineMessages } from './types';

describe('built-in dictionaries', () => {
  it('ships both locales with exactly the same keys', () => {
    const en = Object.keys(defaultMessages.en).sort();
    const ru = Object.keys(defaultMessages.ru).sort();

    expect(ru).toEqual(en);
  });

  it('fills every string key in both locales', () => {
    for (const locale of ['en', 'ru'] as const) {
      const messages = defaultMessages[locale] as Record<keyof SlotlineMessages, unknown>;
      for (const [key, value] of Object.entries(messages)) {
        if (key === 'weekdays') {
          expect(Array.isArray(value)).toBe(true);
          continue;
        }
        expect(typeof value, `${locale}.${key}`).toBe('string');
        expect(String(value).length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('names the attempt and invitation states the flow can reach', () => {
    for (const locale of ['en', 'ru'] as const) {
      const messages = defaultMessages[locale];
      expect(messages.attemptUnknownTitle).toBeTruthy();
      expect(messages.retryWindowExpiredDescription).toBeTruthy();
      expect(messages.invitationSentDescription).toContain('{email}');
      expect(messages.invitationPendingDescription).toContain('{email}');
      expect(messages.invitationFailedDescription).toContain('{email}');
      expect(messages.slotUtcOffsetDescription).toContain('{offset}');
    }
  });
});

describe('resolveMessageLocale', () => {
  it('maps any Russian tag to the Russian dictionary', () => {
    expect(resolveMessageLocale('ru')).toBe('ru');
    expect(resolveMessageLocale('ru-RU')).toBe('ru');
    expect(resolveMessageLocale('RU')).toBe('ru');
  });

  it('falls back to English for everything else', () => {
    expect(resolveMessageLocale('de-DE')).toBe('en');
    expect(resolveMessageLocale(undefined)).toBe('en');
  });
});

describe('resolveMessages', () => {
  it('returns the dictionary itself when there are no overrides', () => {
    expect(resolveMessages('en')).toBe(defaultMessages.en);
  });

  it('merges overrides on top of the locale defaults', () => {
    const merged = resolveMessages('ru', { title: 'Своё название' });

    expect(merged.title).toBe('Своё название');
    expect(merged.emailLabel).toBe(defaultMessages.ru.emailLabel);
    expect(defaultMessages.ru.title).not.toBe('Своё название');
  });

  it('never lets an explicit undefined override a default', () => {
    const merged = resolveMessages('en', { title: undefined });

    expect(merged.title).toBe(defaultMessages.en.title);
  });
});

describe('format', () => {
  it('substitutes every known placeholder', () => {
    expect(
      format('{date} at {time} for {duration}', {
        date: 'Monday, May 18',
        time: '09:15',
        duration: '30 min',
      }),
    ).toBe('Monday, May 18 at 09:15 for 30 min');
  });

  it('leaves unknown placeholders in place', () => {
    expect(format('Hi {name}, {missing}', { name: 'Ann' })).toBe('Hi Ann, {missing}');
  });

  it('returns plain text: a dictionary cannot inject markup', () => {
    // Nothing is parsed or escaped here; bindings render the result as a text
    // node, which is what keeps a dictionary harmless.
    expect(format('<i>{value}</i>', { value: 'a&b' })).toBe('<i>a&b</i>');
  });
});
