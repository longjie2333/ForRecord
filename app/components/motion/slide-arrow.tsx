import { ArrowRightIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { MotionNodeAnimationOptions } from 'motion'
import type { ReactNode } from 'react'

export type SlideArrowAnimation = 'spring' | 'ease'

// Who owns the leading end's exit. `slide` moves the whole slot away, `swap`
// keeps the slot still and lets the node inside trade one icon for the next in
// place — pass something like IconSwap there, and `arrow={null}` when the icon
// arriving in the slot is already the arrow.
export type SlideArrowLeadingAnimation = 'slide' | 'swap'

// The two presets move both ends of the row the same distance and differ only in
// how the movement settles: the spring overshoots a touch and snaps back, the
// ease lands once on the shared exponential curve.
export type SlideArrowMotion = {
  distance: number
  transition: NonNullable<MotionNodeAnimationOptions['transition']>
}

const animations: Record<SlideArrowAnimation, SlideArrowMotion> = {
  spring: { distance: 10, transition: { type: 'spring', stiffness: 600, damping: 25 } },
  ease: { distance: 8, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
}

// One element shared by every call site: rebuilding it as a default parameter
// would hand React a new node on each render.
const defaultArrow = <ArrowRightIcon aria-hidden="true" />

// Both ends sit in fixed-width slots, so only the icons move and the label never
// shifts. The `_svg` selector reaches through a nested component (an IconSwap,
// say) and leaves a bare icon alone too.
const slotClassName = 'motion-slot flex size-4 flex-none items-center justify-center [&_svg]:size-4 [&_svg]:opacity-76'

// A leading icon that gives way to an arrow at the far edge of the row: the pair
// reads as "this takes you somewhere". The label goes in `children`, which lands
// between the two slots in the row's flex layout.
//
//   <SlideArrow active={active} leading={<HouseIcon />}>首页</SlideArrow>
//
// Swap the default exit for one the node owns — the slot stays put and the icon
// it holds can be replaced in place, so the arrow arrives on the left instead of
// the right:
//
//   <SlideArrow
//     active={active}
//     leadingAnimation="swap"
//     arrow={null}
//     leading={<IconSwap active={active} offIcon={<HouseIcon />} onIcon={<ArrowRightIcon />} animation="slide-reverse" />}
//   >
//     首页
//   </SlideArrow>
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
  // `null` drops the trailing slot entirely, for the call sites where the
  // leading icon itself becomes the arrow.
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
        // A plain span: the slot owns nothing but its size, so whatever runs
        // inside it (IconSwap's own enter/exit) is free to animate.
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
