import { useState } from 'react'

// One boolean for "this element is hovered or keyboard-focused", so an element can
// replay the same micro-interaction for both inputs instead of hover only.
export const useHoverActive = () => {
  const [active, setActive] = useState(false)
  return {
    active,
    hoverProps: {
      onPointerEnter: () => setActive(true),
      onPointerLeave: () => setActive(false),
      onFocus: () => setActive(true),
      onBlur: () => setActive(false),
    },
  }
}
