import type { CSSProperties } from 'react';
import { useClassNames } from '../context';
import { ChevronLeftIcon } from './icons';
import type {
  DayContentPartProps,
  EmptyPartProps,
  ErrorPartProps,
  HeaderPartProps,
  LoadingPartProps,
  SlotPartProps,
} from '../parts';

/**
 * The small default parts.
 *
 * They read the class-name overrides from the UI context — a library default is
 * allowed to — while a part an application supplies receives everything through its
 * props and needs no context at all.
 */

export function Header({ title, durationLabel, back, children }: HeaderPartProps) {
  const cls = useClassNames();

  return (
    <header className={cls('header')}>
      {back ? (
        <button
          type="button"
          className="sl-icon-button"
          onClick={back.onClick}
          aria-label={back.label}
          disabled={back.disabled}
        >
          <ChevronLeftIcon />
        </button>
      ) : null}
      <div className="sl-header-main">
        <h2 className={cls('title')}>{title}</h2>
        <span className={cls('badge')}>{durationLabel}</span>
      </div>
      {children}
    </header>
  );
}

/** The content of a day: the button, its focus and its keyboard stay in the library. */
export function DayContent({ day, dayView }: DayContentPartProps) {
  const cls = useClassNames();

  return (
    <>
      <span className="sl-day-number">{Number(day.slice(8, 10))}</span>
      <span
        className={cls('dayDot')}
        aria-hidden="true"
        data-visible={dayView?.bookable || undefined}
      />
    </>
  );
}

export function SlotButton({ slotProps, children }: SlotPartProps) {
  return <button {...slotProps}>{children}</button>;
}

export function LoadingBlock({ count = 9 }: LoadingPartProps) {
  const cls = useClassNames();

  return (
    <div className={cls('slots')} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cls('skeleton')}
          style={{ '--sl-index': index } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, retryLabel, onRetry }: ErrorPartProps) {
  const cls = useClassNames();

  return (
    <div className={cls('error')} role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="sl-link-button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ title, body, action }: EmptyPartProps) {
  const cls = useClassNames();

  return (
    <div className={cls('empty')}>
      <p className="sl-empty-title">{title}</p>
      <p className="sl-empty-body">{body}</p>
      {action ? (
        <button type="button" className={cls('secondaryButton')} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
