import { useEffect, useRef } from 'react';
import { FLOW_STEPS, format, stepIndex } from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow, useUI } from '../context';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CalendarStep } from './CalendarStep';
import { ConfirmedStep } from './ConfirmedStep';
import { DetailsStep } from './DetailsStep';
import { DurationFooter } from './DurationFooter';
import { Progress } from './Progress';
import { SlotsStep } from './SlotsStep';
import { ChevronLeftIcon } from './icons';

function StepBody() {
  const { state } = useFlow();
  switch (state.step) {
    case 'time':
      return <SlotsStep />;
    case 'details':
      return <DetailsStep />;
    case 'confirmed':
      return <ConfirmedStep />;
    case 'date':
    default:
      return <CalendarStep />;
  }
}

/** The full widget: card, header, progress, panel, footer. */
export function SlotlineView() {
  const flow = useFlow();
  const { state, messages, title, durationLabel, actions, canGoBack } = flow;
  const submitting = state.submitStatus === 'submitting';
  const ui = useUI();
  const cls = useClassNames();
  const Animations = ui.animations;
  const cardRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

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
  }, [state.step, ui.autoFocus]);

  const announcement =
    state.step === 'confirmed'
      ? `${messages.bookedTitle}. ${format(messages.bookedSummary, {
          date: flow.selectedDateLabel,
          time: flow.selectedTimeLabel,
          duration: durationLabel,
        })}`
      : format(messages.progressLabel, {
          step: stepIndex(state.step) + 1,
          total: FLOW_STEPS.length,
        });

  return (
    <div
      className={cls('root', ui.className)}
      data-sl-theme={flow.theme}
      data-sl-step={state.step}
      lang={flow.locale}
    >
      <div className={cls('card')} ref={cardRef}>
        <header className={cls('header')}>
          {canGoBack ? (
            <button
              type="button"
              className="sl-icon-button"
              onClick={actions.back}
              aria-label={messages.back}
              disabled={submitting}
            >
              <ChevronLeftIcon />
            </button>
          ) : null}
          <div className="sl-header-main">
            <h2 className={cls('title')}>{title}</h2>
            <span className={cls('badge')}>{durationLabel}</span>
          </div>
          <Progress />
        </header>

        <div className={cls('panel')} ref={panelRef} tabIndex={-1}>
          <Animations.Height>
            <Animations.StepHost stepKey={state.step} direction={state.direction}>
              <StepBody />
            </Animations.StepHost>
          </Animations.Height>
        </div>

        {state.step === 'date' ? <DurationFooter /> : null}

        <div className="sl-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>
      </div>
    </div>
  );
}
