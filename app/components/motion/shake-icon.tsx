// Spread onto a motion icon so every button shakes with the same physics. The
// origin is the icon's own box: SVG rotates around the view box's corner by
// default, which reads as a wobble instead of a shake.
export const shakeAnimation = (shaking: boolean) => ({
  animate: shaking ? { rotate: [0, -9, 7, -5, 3, 0] } : { rotate: 0 },
  transition: { duration: 0.46, ease: 'easeInOut' as const },
  style: { transformBox: 'fill-box' as const, transformOrigin: 'center' },
})

// The magnifier is carried by its handle, not by its middle: pinning the origin
// to the handle's end makes the glass swing a wider arc while the grip stays
// put, the way a hand waves a lens over the page. Lucide draws that handle out
// to 21,21 of the 24px box; Chrome resolves the 90% against the element box, so
// the pivot lands at 21.6 — right on the tip. The arc is longer and slower than
// the button shake because the moving end is further from the pivot.
export const swingAnimation = (swinging: boolean) => ({
  animate: swinging ? { rotate: [0, -16, 13, -9, 4, 0] } : { rotate: 0 },
  transition: { duration: 0.62, ease: 'easeInOut' as const },
  style: { transformBox: 'fill-box' as const, transformOrigin: '90% 90%' },
})
