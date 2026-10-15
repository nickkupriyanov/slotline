import { useEffect, useRef } from 'react';
import { useClassNames, useComponents, useFlow, useUI } from '../context';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CalendarStep } from './CalendarStep';
import { Controls } from './Controls';
import { DetailsStep } from './DetailsStep';
import { SlotsStep } from './SlotsStep';

function StepBody() {
  const { snapshot, actions } = useFlow();
  const { Attempt, Confirmation } = useComponents();
  const ui = useUI();
  const view = snapshot.view;

  switch (view.step) {
    case 'time':
      // The adaptive layout shows the calendar beside the offers. Below 720px of
      // container width the pair is one column again, and the attribute does not
      // change: the container decides, once.
      return ui.layout === 'adaptive' ? (
        <div className="sl-adaptive-pair">
          <CalendarStep />
          <SlotsStep />
        </div>
      ) : (
        <SlotsStep />
      );
    case 'details':
      return <DetailsStep />;
    case 'attempt':
      return view.attempt ? (
        <Attempt attempt={view.attempt} actions={{ retry: actions.retry }} />
      ) : null;
    case 'confirmed':
      return view.confirmation ? (
        <Confirmation confirmation={view.confirmation} actions={{ reset: actions.reset }} />
      ) : null;
    case 'date':
    default:
      return <CalendarStep />;
  }
}

/** The full widget: card, header, progress, panel, footer. */
export function SlotlineView() {
  const { snapshot, actions } = useFlow();
  const ui = useUI();
  const { Header, Progress, DurationFooter } = useComponents();
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
      data-sl-layout={ui.layout}
      lang={ui.locale}
    >
      <div className={cls('card')} ref={cardRef}>
        <Header
          title={view.title}
          durationLabel={view.duration.label}
          back={
            canGoBack
              ? {
                  label: ui.messages.back,
                  disabled: view.form.submitting,
                  onClick: actions.back,
                }
              : null
          }
        >
          <Progress progress={view.progress} />
        </Header>

        <Controls />

        <div
          className={cls('panel')}
          ref={panelRef}
          tabIndex={-1}
          role="region"
          aria-label={view.panelLabel}
        >
          <Animations.Height>
            <Animations.StepHost stepKey={view.step} direction={view.direction}>
              <StepBody />
            </Animations.StepHost>
          </Animations.Height>
        </div>

        {view.step === 'date' ? (
          <DurationFooter duration={view.duration} onSelect={actions.setDuration} />
        ) : null}

        <div className="sl-visually-hidden" role="status" aria-live="polite">
          {view.live.message}
        </div>
      </div>
    </div>
  );
}
