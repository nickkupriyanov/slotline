/**
 * Built-in copy. Two locales ship in the box (`en`, `ru`); any other language
 * tag still works — `Intl` then formats the dates while the copy falls back to
 * English, or to whatever you pass via the `messages` prop.
 */
import type { SlotlineMessages, BuiltInLocale } from './types';

const en: SlotlineMessages = {
  title: 'Book a meeting',
  bookedHeader: 'Booked',
  progressLabel: 'Step {step} of {total}',
  duration: '{count} min',
  durationLabel: 'Duration',
  durationGroupLabel: 'Meeting duration',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  back: 'Back',
  calendarLabel: 'Choose a date',
  dayUnavailable: 'No times available',
  slotsCount: '{count} slots',
  noSlotsTitle: 'No times available',
  noSlotsBody: 'There are no free slots on this day.',
  pickAnotherDay: 'Pick another day',
  slotsLabel: 'Choose a time',
  nameLabel: 'Your name',
  emailLabel: 'Email',
  confirm: 'Confirm booking',
  confirming: 'Booking…',
  nameRequired: 'Enter your name',
  emailRequired: 'Enter your email',
  emailInvalid: 'Enter a valid email address',
  genericError: 'Something went wrong. Please try again.',
  retry: 'Try again',
  bookedSummary: '{date} at {time} for {duration}.',
  inviteSent: 'Calendar invite sent to {email}.',
  bookAnother: 'Book another',
  bookedTitle: "You're booked",
  timeZoneHint: 'Times shown in {zone}',
  weekdays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
};

const ru: SlotlineMessages = {
  title: 'Записаться на встречу',
  bookedHeader: 'Готово',
  progressLabel: 'Шаг {step} из {total}',
  duration: '{count} мин',
  durationLabel: 'Длительность',
  durationGroupLabel: 'Длительность встречи',
  previousMonth: 'Предыдущий месяц',
  nextMonth: 'Следующий месяц',
  back: 'Назад',
  calendarLabel: 'Выберите дату',
  dayUnavailable: 'Нет свободного времени',
  slotsCount: 'Слотов: {count}',
  noSlotsTitle: 'Нет свободного времени',
  noSlotsBody: 'На этот день свободных слотов нет.',
  pickAnotherDay: 'Выбрать другой день',
  slotsLabel: 'Выберите время',
  nameLabel: 'Ваше имя',
  emailLabel: 'Email',
  confirm: 'Подтвердить запись',
  confirming: 'Записываем…',
  nameRequired: 'Укажите имя',
  emailRequired: 'Укажите email',
  emailInvalid: 'Введите корректный email',
  genericError: 'Что-то пошло не так. Попробуйте ещё раз.',
  retry: 'Повторить',
  bookedSummary: '{date} в {time}, {duration}.',
  inviteSent: 'Приглашение отправлено на {email}.',
  bookAnother: 'Записаться ещё',
  bookedTitle: 'Вы записаны',
  timeZoneHint: 'Время указано в {zone}',
  weekdays: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};

const locales: Record<BuiltInLocale, SlotlineMessages> = { en, ru };

export const defaultMessages: Record<BuiltInLocale, SlotlineMessages> = locales;

/** Locale tag for the copy layer: `ru*` → Russian, everything else → English. */
export function resolveMessageLocale(locale: string | undefined): BuiltInLocale {
  return locale && locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

/** Locale tag for `Intl`, defaulting to the browser preference. */
export function detectLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en';
}

/**
 * Merges locale defaults with consumer overrides.
 * `undefined` values in `overrides` never win over a default.
 */
export function resolveMessages(
  locale: string | undefined,
  overrides?: Partial<SlotlineMessages>,
): SlotlineMessages {
  const base = locales[resolveMessageLocale(locale)];
  if (!overrides) return base;
  const merged: SlotlineMessages = { ...base };
  for (const key of Object.keys(overrides) as (keyof SlotlineMessages)[]) {
    const value = overrides[key];
    if (value !== undefined) {
      // The dictionary is string-valued apart from `weekdays`; the cast keeps
      // the public type friendly while staying sound at runtime.
      merged[key] = value as never;
    }
  }
  return merged;
}

/** `format('{date} at {time}', { date, time })` — unknown placeholders stay put. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
