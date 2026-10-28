// Spread onto a motion icon so every button shakes with the same physics. The origin is the
// icon's own box: an SVG rotates around its view box's corner by default, which reads as a
// wobble instead of a shake.
export const shakeAnimation = (shaking: boolean) => ({
  animate: shaking ? { rotate: [0, -9, 7, -5, 3, 0] } : { rotate: 0 },
  transition: { duration: 0.46, ease: 'easeInOut' as const },
  style: { transformBox: 'fill-box' as const, transformOrigin: 'center' },
})

// The magnifier swings from its handle: Lucide draws it out to 21,21 of the 24px box, so a
// 90%/90% origin lands on the tip and the glass sweeps a wider arc while the grip stays put.
export const swingAnimation = (swinging: boolean) => ({
  animate: swinging ? { rotate: [0, -16, 13, -9, 4, 0] } : { rotate: 0 },
  transition: { duration: 0.62, ease: 'easeInOut' as const },
  style: { transformBox: 'fill-box' as const, transformOrigin: '90% 90%' },
})
