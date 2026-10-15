import { useEffect, useRef } from 'react';
import { useClassNames, useFlow, useUI } from '../context';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { AttemptStep } from './AttemptStep';
import { CalendarStep } from './CalendarStep';
import { ConfirmedStep } from './ConfirmedStep';
import { DetailsStep } from './DetailsStep';
import { DurationFooter } from './DurationFooter';
import { Progress } from './Progress';
import { SlotsStep } from './SlotsStep';
import { ChevronLeftIcon } from './icons';

function StepBody() {
  const { snapshot } = useFlow();

  switch (snapshot.view.step) {
    case 'time':
      return <SlotsStep />;
    case 'details':
      return <DetailsStep />;
    case 'attempt':
      return <AttemptStep />;
    case 'confirmed':
      return <ConfirmedStep />;
    case 'date':
    default:
      return <CalendarStep />;
  }
}

/** The full widget: card, header, progress, panel, footer. */
export function SlotlineView() {
  const { snapshot, actions } = useFlow();
  const ui = useUI();
  const cls = useClassNames();
  const Animations = ui.animations;
  const view = snapshot.view;
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // The confirmation is terminal and the attempt screen is blocked, so on those
  // only an application-supplied dismiss handler makes going "back" meaningful.
  const canGoBack =
    view.actions.canGoBack ||
    ((view.step === 'date' || view.step === 'confirmed') && ui.canDismiss);

  useFocusTrap(cardRef, {
    active: ui.trapFocus,
    ...(canGoBack ? { onEscape: actions.back } : {}),
  });

  // Keep DOM focus inside the widget when the previous step unmounts the
  // element the user activated — otherwise focus silently falls back to <body>.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (ui.autoFocus) panelRef.current?.focus();
      return;
    }
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (!active || active === document.body) panelRef.current?.focus();
  }, [view.step, ui.autoFocus]);

  return (
    <div
      className={cls('root', ui.className)}
      data-sl-theme={ui.theme}
      data-sl-step={view.step}
      lang={ui.locale}
    >
      <div className={cls('card')} ref={cardRef}>
        <header className={cls('header')}>
          {canGoBack ? (
            <button
              type="button"
              className="sl-icon-button"
              onClick={actions.back}
              aria-label={ui.messages.back}
              disabled={view.form.submitting}
            >
              <ChevronLeftIcon />
            </button>
          ) : null}
          <div className="sl-header-main">
            <h2 className={cls('title')}>{view.title}</h2>
            <span className={cls('badge')}>{view.duration.label}</span>
          </div>
          <Progress />
        </header>

        <div className={cls('panel')} ref={panelRef} tabIndex={-1}>
          <Animations.Height>
            <Animations.StepHost stepKey={view.step} direction={view.direction}>
              <StepBody />
            </Animations.StepHost>
          </Animations.Height>
        </div>

        {view.step === 'date' ? <DurationFooter /> : null}

        <div className="sl-visually-hidden" role="status" aria-live="polite">
          {view.live.message}
        </div>
      </div>
    </div>
  );
}
