import type { ComponentType, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAnimatedHeight } from '../hooks/useAnimatedHeight';
import type { AnimationKit, HeightProps, StaggerItemProps, StepHostProps } from '../types';
import { cx } from '@nickkupriyanov/slotline-core';

const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 } as const;

/**
 * `motion.button` conflicts with the DOM button props we accept (`onDragStart`
 * and friends have incompatible signatures), so the component is narrowed here
 * instead of leaking casts into the widget.
 */
const MotionButton = motion.button as unknown as ComponentType<
  Record<string, unknown> & { children?: ReactNode; className?: string }
>;

function StepHost({ stepKey, direction, className, children }: StepHostProps) {
  const forward = direction === 1;
  return (
    <div className={cx('sl-step-host', className)} data-direction={forward ? 'forward' : 'back'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stepKey}
          className="sl-step"
          initial={{ opacity: 0, y: forward ? 12 : -12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: forward ? -10 : 10, scale: 0.99 }}
          transition={spring}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Item({ index, className, type = 'button', children, ...rest }: StaggerItemProps) {
  return (
    <MotionButton
      {...rest}
      type={type}
      className={cx('sl-stagger-item', className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index, 14) * 0.018 }}
      whileTap={{ scale: 0.97 }}
    >
      {children}
    </MotionButton>
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
 * Spring-based kit. Requires the optional `motion` peer dependency and is the
 * whole point of the `@nickkupriyanov/slotline-react/motion` entry point.
 */
export const motionAnimations: AnimationKit = {
  StepHost,
  Item,
  Height,
};
