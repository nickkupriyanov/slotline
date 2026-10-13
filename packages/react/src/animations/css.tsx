import type { CSSProperties } from 'react';
import { useAnimatedHeight } from '../hooks/useAnimatedHeight';
import type { AnimationKit, HeightProps, StaggerItemProps, StepHostProps } from '../types';
import { cx } from '@nickkupriyanov/slotline-core';

function StepHost({ stepKey, direction, className, children }: StepHostProps) {
  return (
    <div
      className={cx('sl-step-host', className)}
      data-direction={direction === 1 ? 'forward' : 'back'}
    >
      <div className="sl-step" key={stepKey}>
        {children}
      </div>
    </div>
  );
}

function Item({ index, className, style, type = 'button', children, ...rest }: StaggerItemProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx('sl-slot', 'sl-stagger-item', className)}
      style={{ ...style, '--sl-index': index } as CSSProperties}
    >
      {children}
    </button>
  );
}

function Height({ className, children }: HeightProps) {
  const { contentRef, style } = useAnimatedHeight<HTMLDivElement>();
  return (
    <div className={cx('sl-height', className)} style={style}>
      <div className="sl-height-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

/**
 * The default kit: no runtime, no dependencies. Every transition is a CSS
 * animation or transition, and all of them collapse under
 * `prefers-reduced-motion: reduce`.
 */
export const cssAnimations: AnimationKit = {
  StepHost,
  Item,
  Height,
};
