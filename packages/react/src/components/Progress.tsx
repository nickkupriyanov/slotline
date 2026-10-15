import { useClassNames, useFlow } from '../context';

/** Three morphing pills: narrow while upcoming, wide once reached. */
export function Progress() {
  const { snapshot } = useFlow();
  const cls = useClassNames();
  const { progress } = snapshot.view;

  return (
    <div
      className={cls('progress')}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={progress.total}
      aria-valuenow={progress.current}
      aria-valuetext={progress.label}
    >
      {progress.steps.map((step, position) => (
        <span
          key={step}
          className="sl-progress-pill"
          data-state={position < progress.current ? 'done' : 'todo'}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
