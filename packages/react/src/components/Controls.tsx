import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTimeZoneName, type TimeFormat } from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow, useUI } from '../context';

/** How many zones the popover renders at once; the search narrows it down. */
const VISIBLE_ZONES = 60;

/**
 * The time zone selector and the 12/24 switch.
 *
 * Both are optional and off by default: an application that already has a zone
 * control of its own — as the playgrounds do — does not get a second one.
 *
 * The popover is positioned inside the widget root rather than portalled. Nothing on
 * the way out clips it: the panel scrolls, but the controls sit above it, and the card
 * that can be height-limited does not hide its overflow. An application whose own
 * ancestors clip the widget can still render its own control and drive the same
 * actions.
 */
export function Controls() {
  const { snapshot, actions } = useFlow();
  const { messages, locale } = useUI();
  const cls = useClassNames();
  const view = snapshot.view;
  const { timeZone, timeFormat } = view;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const zones = needle
      ? timeZone.options.filter((zone) => zone.toLowerCase().includes(needle))
      : timeZone.options;
    return zones.slice(0, VISIBLE_ZONES);
  }, [query, timeZone.options]);

  const formats: TimeFormat[] = ['12h', '24h'];
  const formatLabels: Record<TimeFormat, string> = {
    '12h': messages.timeFormat12HourLabel,
    '24h': messages.timeFormat24HourLabel,
  };

  if (!timeZone.showSelector && !timeFormat.showSelector) return null;

  return (
    <div className="sl-controls" ref={rootRef}>
      {timeZone.showSelector ? (
        <div className="sl-control">
          <button
            type="button"
            className="sl-control-button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => {
              setOpen((value) => !value);
              setQuery('');
            }}
          >
            {messages.timeZoneLabel}: <span className="sl-control-value">{timeZone.name}</span>
          </button>

          {open ? (
            <div className="sl-popover" role="dialog" aria-label={messages.timeZoneLabel}>
              <label className="sl-popover-search">
                <span className="sl-visually-hidden">{messages.timeZoneSearchLabel}</span>
                <input
                  ref={searchRef}
                  type="search"
                  className={cls('input')}
                  placeholder={messages.timeZoneSearchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              {matches.length === 0 ? (
                <p className="sl-popover-empty">{messages.timeZoneNoResultsDescription}</p>
              ) : (
                <ul
                  className="sl-zone-list"
                  role="listbox"
                  aria-label={messages.timeZoneSearchLabel}
                >
                  {matches.map((zone) => (
                    <li key={zone}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={zone === timeZone.current}
                        className="sl-zone-option"
                        data-state={zone === timeZone.current ? 'active' : 'idle'}
                        onClick={() => {
                          actions.setTimeZone(zone);
                          setOpen(false);
                        }}
                      >
                        <span>{formatTimeZoneName(zone, locale, new Date()) ?? zone}</span>
                        <span className="sl-zone-id">{zone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {timeFormat.showSelector ? (
        <div className="sl-control">
          <div className="sl-segmented" role="radiogroup" aria-label={messages.timeFormatLabel}>
            {formats.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === timeFormat.current}
                className="sl-segmented-option"
                data-state={option === timeFormat.current ? 'active' : 'idle'}
                onClick={() => actions.setTimeFormat(option)}
              >
                {formatLabels[option]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
