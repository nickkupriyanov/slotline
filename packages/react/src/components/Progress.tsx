import { useClassNames } from '../context';
import type { ProgressPartProps } from '../parts';

/** Three morphing pills: narrow while upcoming, wide once reached. */
export function Progress({ progress }: ProgressPartProps) {
  const cls = useClassNames();

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
