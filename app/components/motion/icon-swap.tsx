import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { MotionNodeAnimationOptions } from 'motion'

export type IconSwapAnimation = 'pop' | 'spring' | 'slide' | 'slide-reverse'

// The four fields the swap owns: a preset describes the icon that arrives and
// the one that leaves, nothing else on the element.
export type IconSwapMotion = Pick<MotionNodeAnimationOptions, 'initial' | 'animate' | 'exit' | 'transition'>

// The default rides one shared exponential curve; the alternatives trade that
// precision for a spring's overshoot or a short sideways slide. The two slides
// mirror each other so a row of icons can keep travelling the same way.
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

// One icon leaves as the next arrives: both sit in the same grid cell so the
// row never shifts while they trade places, and the animation only decides how
// they move within it. Pass a name for one of the presets, or the four fields
// themselves when a call site needs its own timing.
export const IconSwap = ({
  active,
  onIcon,
  offIcon,
  className,
  animation = 'pop',
}: {
  active: boolean
  onIcon: ReactNode
  offIcon: ReactNode
  className?: string
  animation?: IconSwapAnimation | IconSwapMotion
}) => {
  const preset = typeof animation === 'string' ? animations[animation] : animation
  return (
    <span className={`icon-swap motion-slot relative inline-grid place-items-center ${className ?? ''}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={active ? 'on' : 'off'}
          className="col-start-1 row-start-1 flex items-center justify-center"
          {...preset}
        >
          {active ? onIcon : offIcon}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
