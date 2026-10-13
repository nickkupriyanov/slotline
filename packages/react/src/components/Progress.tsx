import { FLOW_STEPS, format, stepIndex } from '@nickkupriyanov/slotline-core';
import { useClassNames, useFlow } from '../context';

/** Three morphing pills: narrow while upcoming, wide once reached. */
export function Progress() {
  const { state, messages } = useFlow();
  const cls = useClassNames();
  const index = stepIndex(state.step);

  return (
    <div
      className={cls('progress')}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={FLOW_STEPS.length}
      aria-valuenow={index + 1}
      aria-valuetext={format(messages.progressLabel, {
        step: index + 1,
        total: FLOW_STEPS.length,
      })}
    >
      {FLOW_STEPS.map((step, position) => (
        <span
          key={step}
          className="sl-progress-pill"
          data-state={position <= index ? 'done' : 'todo'}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
