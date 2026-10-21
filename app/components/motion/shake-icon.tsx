import { useState } from 'react'

// Hovering or focusing the button rattles its icon like a small physical object:
// one quick decaying rotation, replayed on every fresh hover.
export const useShakeOnHover = () => {
  const [shaking, setShaking] = useState(false)
  return {
    shaking,
    shakeProps: {
      onPointerEnter: () => setShaking(true),
      onPointerLeave: () => setShaking(false),
      onFocus: () => setShaking(true),
      onBlur: () => setShaking(false),
    },
  }
}

// Spread onto a motion icon so both buttons shake with the same physics. The
// origin is the icon's own box: SVG rotates around the view box's corner by
// default, which reads as a wobble instead of a shake.
export const shakeAnimation = (shaking: boolean) => ({
  animate: shaking ? { rotate: [0, -9, 7, -5, 3, 0] } : { rotate: 0 },
  transition: { duration: 0.46, ease: 'easeInOut' as const },
  style: { transformBox: 'fill-box' as const, transformOrigin: 'center' },
})
