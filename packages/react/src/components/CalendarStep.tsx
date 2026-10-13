import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  countSlots,
  format,
  formatFullDay,
  monthKeyOf,
  todayKey,
  weekdayIndex,
} from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow } from '../context';
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
 */
export function CalendarStep() {
  const {
    state,
    messages,
    locale,
    timeZone,
    timeZoneName,
    monthLabel,
    monthGrid,
    weekdayHeaders,
    weekdayLongNames,
    weekStartsOn,
    actions,
    availabilityOf,
    isDayBookable,
  } = useFlow();
  const cls = useClassNames();
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);
  /** Day-of-month to restore after PageUp/PageDown swapped the visible month. */
  const pendingMonthFocusRef = useRef<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const today = todayKey(timeZone);

  const rows = useMemo(() => chunk(monthGrid, 7), [monthGrid]);

  const firstBookable = useMemo(
    () => monthGrid.find((day) => monthKeyOf(day) === state.month && isDayBookable(day)),
    [monthGrid, state.month, isDayBookable],
  );

  /**
   * The single tab stop of the grid (roving tabindex). The candidate has to
   * exist in the *current* grid: after a month change the previously focused
   * key is gone, and a stale value would leave every cell at `tabindex="-1"`.
   */
  const focusTarget = useMemo(() => {
    if (focusKey && monthGrid.includes(focusKey)) return focusKey;
    if (state.selectedDate && monthGrid.includes(state.selectedDate)) return state.selectedDate;
    return firstBookable ?? monthGrid[0] ?? `${state.month}-01`;
  }, [focusKey, monthGrid, state.selectedDate, firstBookable, state.month]);

  useEffect(() => {
    if (!pendingFocusRef.current || !focusKey) return;
    pendingFocusRef.current = false;
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`);
    node?.focus();
  }, [focusKey, monthGrid]);

  // PageUp/PageDown rebuild the grid, so bring the keyboard along — otherwise
  // focus dies with the unmounted cell.
  useEffect(() => {
    const dayOfMonth = pendingMonthFocusRef.current;
    if (!dayOfMonth) return;
    pendingMonthFocusRef.current = null;
    const sameDay = monthGrid.find(
      (candidate) => monthKeyOf(candidate) === state.month && candidate.slice(8, 10) === dayOfMonth,
    );
    const target = sameDay ?? monthGrid.find((candidate) => monthKeyOf(candidate) === state.month);
    if (!target) return;
    pendingFocusRef.current = true;
    setFocusKey(target);
  }, [state.month, monthGrid]);

  const moveFocus = useCallback((nextKey: string) => {
    pendingFocusRef.current = true;
    setFocusKey(nextKey);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = (event.target as HTMLElement).dataset?.day;
      if (!current) return;
      const offsetFromWeekStart = (weekdayIndex(current) - weekStartsOn + 7) % 7;
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
      const last = monthGrid[monthGrid.length - 1];
      const first = monthGrid[0];
      if (last && first && (next < first || next > last)) {
        actions.goToMonth(monthKeyOf(next));
      }
      moveFocus(next);
    },
    [actions, monthGrid, moveFocus, weekStartsOn],
  );

  return (
    <div className={cls('calendar')} data-status={state.daysStatus}>
      <div className={cls('calendarHeader')}>
        <h3 className={cls('monthLabel')}>{monthLabel}</h3>
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
        {weekdayHeaders.map((label, index) => (
          <span key={weekdayLongNames[index] ?? index} className={cls('weekday')}>
            <span aria-hidden="true">{label}</span>
            <span className="sl-visually-hidden">{weekdayLongNames[index]}</span>
          </span>
        ))}
      </div>

      {state.daysStatus === 'error' ? (
        <div className={cls('error')} role="alert">
          <span>{state.daysError}</span>
          <button type="button" className="sl-link-button" onClick={actions.reloadAvailability}>
            {messages.retry}
          </button>
        </div>
      ) : null}

      <div
        ref={gridRef}
        key={state.month}
        className={cls('grid')}
        role="grid"
        aria-label={messages.calendarLabel}
        aria-busy={state.daysStatus === 'loading'}
        onKeyDown={onKeyDown}
      >
        {rows.map((row, rowIndex) => (
          <div className="sl-grid-row" role="row" key={row[0]}>
            {row.map((day, cellIndex) => {
              const outside = monthKeyOf(day) !== state.month;
              const bookable = isDayBookable(day);
              const count = countSlots(availabilityOf(day));
              const selected = state.selectedDate === day;
              const label = [
                formatFullDay(day, locale),
                count !== undefined && count > 0
                  ? format(messages.slotsCount, { count })
                  : messages.dayUnavailable,
              ].join(', ');

              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  data-day={day}
                  tabIndex={day === focusTarget ? 0 : -1}
                  aria-selected={selected || undefined}
                  aria-disabled={!bookable || undefined}
                  aria-current={day === today ? 'date' : undefined}
                  aria-label={label}
                  className={cls(
                    'day',
                    outside && 'is-outside',
                    selected && 'is-selected',
                    bookable && 'is-bookable',
                  )}
                  style={{ '--sl-index': rowIndex * 7 + cellIndex } as React.CSSProperties}
                  onClick={() => {
                    if (!bookable) return;
                    actions.selectDate(day);
                  }}
                >
                  <span className="sl-day-number">{Number(day.slice(8, 10))}</span>
                  <span
                    className={cls('dayDot')}
                    aria-hidden="true"
                    data-visible={bookable || undefined}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="sl-timezone">
        {format(messages.timeZoneHint, { zone: timeZoneName ?? timeZone, timeZone })}
      </p>
    </div>
  );
}
