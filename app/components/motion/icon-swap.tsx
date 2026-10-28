import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { MotionNodeAnimationOptions } from 'motion'

export type IconSwapAnimation = 'pop' | 'spring' | 'slide' | 'slide-reverse'

export type IconSwapMotion = Pick<MotionNodeAnimationOptions, 'initial' | 'animate' | 'exit' | 'transition'>

const animations: Record<IconSwapAnimation, IconSwapMotion> = {
  pop: {
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.5 },
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
  },
  spring: {
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.5 },
    transition: { type: 'spring', stiffness: 600, damping: 25 },
  },
  slide: {
    initial: { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -8 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  'slide-reverse': {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 8 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
}

export const IconSwap = (
  props: {
    className?: string
    animation?: IconSwapAnimation | IconSwapMotion
  } & (
    | { active: boolean; onIcon: ReactNode; offIcon: ReactNode }
    // A third state names the icon it shows rather than pairing two, so consecutive steps
    // still animate.
    | { state: string; icon: ReactNode }
  ),
) => {
  const { className, animation = 'pop' } = props
  const slot =
    'state' in props
      ? { key: props.state, icon: props.icon }
      : { key: props.active ? 'on' : 'off', icon: props.active ? props.onIcon : props.offIcon }
  const preset = typeof animation === 'string' ? animations[animation] : animation
  return (
    <span className={`icon-swap motion-slot relative inline-grid place-items-center ${className ?? ''}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={slot.key} className="col-start-1 row-start-1 flex items-center justify-center" {...preset}>
          {slot.icon}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
