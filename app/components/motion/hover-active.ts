import { useState } from 'react'

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
