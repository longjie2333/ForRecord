import { useEffect, useState } from 'react'

// Keeps an element mounted while its exit transition runs. Pair it with a
// `data-state` attribute so CSS can drive both directions.
export const usePresence = (open: boolean, duration = 240) => {
  const [held, setHeld] = useState(open)
  const [seen, setSeen] = useState(open)
  // Reopening while the exit is still running has to cancel the pending unmount.
  if (seen !== open) {
    setSeen(open)
    if (open) setHeld(true)
  }
  useEffect(() => {
    if (open) return
    const timer = window.setTimeout(() => setHeld(false), duration)
    return () => window.clearTimeout(timer)
  }, [open, duration])
  return { mounted: open || held, state: open ? ('open' as const) : ('closed' as const) }
}
