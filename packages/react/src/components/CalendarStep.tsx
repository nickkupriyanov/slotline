import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, monthKeyOf, weekdayIndex } from '@nickkupriyanov/slotline-core';
import { useClassNames, useComponents, useFlow, useUI } from '../context';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

function chunk<T>(values: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    rows.push(values.slice(index, index + size));
  }
  return rows;
}

/**
 * Step 1 — the month grid. Days carrying availability render a dot and become
 * selectable; everything else stays visible but inert, exactly like the
 * reference design.
 *
 * Everything it renders comes from the view model, including the accessible name
 * of a day; the component only owns focus, roving tabindex and keyboard
 * navigation.
 */
export function CalendarStep() {
  const { snapshot, actions } = useFlow();
  const { messages } = useUI();
  const { DayContent, Error } = useComponents();
  const cls = useClassNames();
  const view = snapshot.view;
  const { month, days } = view;
  const selectedDate = view.selection.date;

  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);
  /** Day-of-month to restore after PageUp/PageDown swapped the visible month. */
  const pendingMonthFocusRef = useRef<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const rows = useMemo(() => chunk(month.grid, 7), [month.grid]);

  const firstBookable = useMemo(
    () => month.grid.find((day) => monthKeyOf(day) === month.key && days[day]?.bookable),
    [month.grid, month.key, days],
  );

  /**
   * The single tab stop of the grid (roving tabindex). The candidate has to
   * exist in the *current* grid: after a month change the previously focused
   * key is gone, and a stale value would leave every cell at `tabindex="-1"`.
   */
  const focusTarget = useMemo(() => {
    if (focusKey && month.grid.includes(focusKey)) return focusKey;
    if (selectedDate && month.grid.includes(selectedDate)) return selectedDate;
    return firstBookable ?? month.grid[0] ?? `${month.key}-01`;
  }, [focusKey, month.grid, selectedDate, firstBookable, month.key]);

  useEffect(() => {
    if (!pendingFocusRef.current || !focusKey) return;
    pendingFocusRef.current = false;
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`);
    node?.focus();
  }, [focusKey, month.grid]);

  // PageUp/PageDown rebuild the grid, so bring the keyboard along — otherwise
  // focus dies with the unmounted cell.
  useEffect(() => {
    const dayOfMonth = pendingMonthFocusRef.current;
    if (!dayOfMonth) return;
    pendingMonthFocusRef.current = null;
    const sameDay = month.grid.find(
      (candidate) => monthKeyOf(candidate) === month.key && candidate.slice(8, 10) === dayOfMonth,
    );
    const target = sameDay ?? month.grid.find((candidate) => monthKeyOf(candidate) === month.key);
    if (!target) return;
    pendingFocusRef.current = true;
    setFocusKey(target);
  }, [month.key, month.grid]);

  const moveFocus = useCallback((nextKey: string) => {
    pendingFocusRef.current = true;
    setFocusKey(nextKey);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = (event.target as HTMLElement).dataset?.day;
      if (!current) return;
      const offsetFromWeekStart = (weekdayIndex(current) - month.weekStartsOn + 7) % 7;
      let next: string | undefined;

      switch (event.key) {
        case 'ArrowLeft':
          next = addDays(current, -1);
          break;
        case 'ArrowRight':
          next = addDays(current, 1);
          break;
        case 'ArrowUp':
          next = addDays(current, -7);
          break;
        case 'ArrowDown':
          next = addDays(current, 7);
          break;
        case 'Home':
          next = addDays(current, -offsetFromWeekStart);
          break;
        case 'End':
          next = addDays(current, 6 - offsetFromWeekStart);
          break;
        case 'PageUp':
          event.preventDefault();
          pendingMonthFocusRef.current = current.slice(8, 10);
          actions.previousMonth();
          return;
        case 'PageDown':
          event.preventDefault();
          pendingMonthFocusRef.current = current.slice(8, 10);
          actions.nextMonth();
          return;
        default:
          return;
      }

      event.preventDefault();
      const last = month.grid[month.grid.length - 1];
      const first = month.grid[0];
      if (last && first && (next < first || next > last)) {
        actions.goToMonth(monthKeyOf(next));
      }
      moveFocus(next);
    },
    [actions, month.grid, month.key, month.weekStartsOn],
  );

  return (
    <div className={cls('calendar')} data-status={month.status}>
      <div className={cls('calendarHeader')}>
        <h3 className={cls('monthLabel')}>{month.label}</h3>
        <div className="sl-calendar-nav">
          <button
            type="button"
            className={cls('navButton')}
            onClick={actions.previousMonth}
            aria-label={messages.previousMonth}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className={cls('navButton')}
            onClick={actions.nextMonth}
            aria-label={messages.nextMonth}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className={cls('weekdays')}>
        {month.weekdayHeaders.map((label, index) => (
          <span key={month.weekdayLongNames[index] ?? index} className={cls('weekday')}>
            <span aria-hidden="true">{label}</span>
            <span className="sl-visually-hidden">{month.weekdayLongNames[index]}</span>
          </span>
        ))}
      </div>

      {month.status === 'error' ? (
        <Error
          message={month.error ?? ''}
          retryLabel={messages.retry}
          onRetry={actions.reloadAvailability}
        />
      ) : null}

      <div
        ref={gridRef}
        key={month.key}
        className={cls('grid')}
        role="grid"
        aria-label={messages.calendarLabel}
        aria-busy={month.status === 'loading'}
        onKeyDown={onKeyDown}
      >
        {rows.map((row, rowIndex) => (
          <div className="sl-grid-row" role="row" key={row[0]}>
            {row.map((day, cellIndex) => {
              const cell = days[day];
              const bookable = cell?.bookable ?? false;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  data-day={day}
                  tabIndex={day === focusTarget ? 0 : -1}
                  aria-selected={cell?.isSelected || undefined}
                  aria-disabled={!bookable || undefined}
                  aria-current={cell?.isToday ? 'date' : undefined}
                  aria-label={cell?.label}
                  className={cls(
                    'day',
                    cell?.isOutside && 'is-outside',
                    cell?.isSelected && 'is-selected',
                    bookable && 'is-bookable',
                  )}
                  style={{ '--sl-index': rowIndex * 7 + cellIndex } as React.CSSProperties}
                  onClick={() => {
                    if (!bookable) return;
                    actions.selectDate(day);
                  }}
                >
                  <DayContent day={day} dayView={cell} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="sl-timezone">{view.time.zoneHint}</p>
    </div>
  );
}
