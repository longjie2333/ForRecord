import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { MotionNodeAnimationOptions } from 'motion'

// One icon leaves as the next arrives: each fades and scales on the shared
// exponential curve, and both sit in the same grid cell so the row never shifts
// while they trade places.
export const IconSwap = ({
  active,
  onIcon,
  offIcon,
  className,
  motionProps,
}: {
  active: boolean
  onIcon: ReactNode
  offIcon: ReactNode
  className?: string
  motionProps?: MotionNodeAnimationOptions
}) => (
  <span className={`icon-swap relative inline-grid place-items-center ${className ?? ''}`}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={active ? 'on' : 'off'}
        className="col-start-1 row-start-1 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        {...motionProps}
      >
        {active ? onIcon : offIcon}
      </motion.span>
    </AnimatePresence>
  </span>
)
