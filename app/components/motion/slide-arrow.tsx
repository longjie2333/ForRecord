import { ArrowRightIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { MotionNodeAnimationOptions } from 'motion'
import type { ReactNode } from 'react'

export type SlideArrowAnimation = 'spring' | 'ease'

// Who owns the leading end's exit: `slide` moves the slot, `swap` keeps it still
// and lets the node inside trade icons (IconSwap, plus `arrow={null}` if the
// arriving icon is the arrow).
export type SlideArrowLeadingAnimation = 'slide' | 'swap'

export type SlideArrowMotion = {
  distance: number
  transition: NonNullable<MotionNodeAnimationOptions['transition']>
}

const animations: Record<SlideArrowAnimation, SlideArrowMotion> = {
  spring: { distance: 10, transition: { type: 'spring', stiffness: 600, damping: 25 } },
  ease: { distance: 8, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
}

// One element shared by every call site: a default parameter would rebuild it per render.
const defaultArrow = <ArrowRightIcon aria-hidden="true" />

const slotClassName = 'motion-slot flex size-4 flex-none items-center justify-center [&_svg]:size-4 [&_svg]:opacity-76'

// A leading icon that gives way to an arrow at the far edge of the row.
export const SlideArrow = ({
  active,
  leading,
  arrow = defaultArrow,
  animation = 'spring',
  leadingAnimation = 'slide',
  children,
}: {
  active: boolean
  leading: ReactNode
  // `null` drops the trailing slot where the leading icon itself becomes the arrow.
  arrow?: ReactNode
  animation?: SlideArrowAnimation | SlideArrowMotion
  leadingAnimation?: SlideArrowLeadingAnimation
  children?: ReactNode
}) => {
  const { distance, transition } = typeof animation === 'string' ? animations[animation] : animation
  return (
    <>
      {leadingAnimation === 'slide' ? (
        <motion.span
          className={`slide-arrow-leading ${slotClassName}`}
          initial={{ opacity: 1, x: 0 }}
          animate={{ opacity: active ? 0 : 1, x: active ? -distance : 0 }}
          transition={transition}
        >
          {leading}
        </motion.span>
      ) : (
        // A plain span: the slot owns only its size, so IconSwap animates freely inside it.
        <span className={`slide-arrow-leading ${slotClassName}`}>{leading}</span>
      )}
      <span className="min-w-0 truncate">{children}</span>
      {arrow !== null && (
        <motion.span
          className={`slide-arrow-trailing ml-auto ${slotClassName}`}
          initial={{ opacity: 0, x: distance }}
          animate={{ opacity: active ? 1 : 0, x: active ? 0 : distance }}
          transition={transition}
        >
          {arrow}
        </motion.span>
      )}
    </>
  )
}
