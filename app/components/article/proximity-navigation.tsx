import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ListIcon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { Drawer, DrawerPopup, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger } from '../ui/drawer.tsx'
import type { Heading } from '../../../shared/posts.ts'

// transitionend bubbles, and the label's opacity finishes before its row's
// height on both ends of the cycle — so a once-listener with a property filter
// is consumed by that first, unrelated event. Wait for the row's own height
// transition instead; the returned disposer cancels it.
const onHeightEnd = (row: HTMLElement, fn: () => void) => {
  const handler = (event: TransitionEvent) => {
    if (event.target !== row || event.propertyName !== 'height') return
    row.removeEventListener('transitionend', handler)
    fn()
  }
  row.addEventListener('transitionend', handler)
  return () => row.removeEventListener('transitionend', handler)
}

export const ProximityNavigation = ({ headings }: { headings: Heading[] }) => {
  const [active, setActive] = useState(headings[0]?.id)
  const [revealed, setRevealed] = useState(false)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const pendingHeading = useRef<string | null>(null)
  const scrollToHeading = (id: string, behavior: ScrollBehavior = 'smooth') => {
    const element = document.getElementById(id)
    if (!element) return
    history.pushState(null, '', `#${encodeURIComponent(id)}`)
    element.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior,
      block: 'start',
    })
  }

  // Long outlines outrun the panel, and the pointer is usually elsewhere, so it
  // follows the reader: keep a slice of what comes next in view instead of
  // parking the current heading on the bottom edge. Out-of-range assignments are
  // clamped by the browser, so the panel simply stops at its own ends.
  const keepVisible = () => {
    const panel = panelRef.current
    const item = panel?.querySelector<HTMLAnchorElement>('a[aria-current="location"]') ?? panel?.firstElementChild
    if (!panel || !item) return
    const lookahead = Math.round(panel.clientHeight * 0.14)
    const top = (item as HTMLElement).offsetTop
    const bottom = top + (item as HTMLElement).offsetHeight
    if (top - lookahead < panel.scrollTop) panel.scrollTop = top - lookahead
    else if (bottom + lookahead > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = bottom + lookahead - panel.clientHeight
    }
  }

  useEffect(() => {
    let frame = 0
    const update = () => {
      let current = headings[0]?.id
      for (const heading of headings) {
        const element = document.getElementById(heading.id)
        if (element && element.getBoundingClientRect().top <= 120) current = heading.id
      }
      setActive(current)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [headings])

  useEffect(keepVisible, [active])

  // Rows animate between 14px and 30px, and every row above the anchor pushes
  // it down as they open — or up as they close. Holding the anchor's row still
  // means feeding that distance back into the scroll on every frame of the
  // animation, in whichever direction it is currently moving; correcting once
  // at the end would only make it jump after having drifted the whole way.
  // The anchor is what keeps the reveal from creeping: opening borrows scroll
  // for the expanded rows, and closing hands exactly that back.
  const pinned = useRef<{ row: HTMLElement; top: number } | null>(null)
  // Pending keepVisible scheduled for the end of a collapse; cancelled when a
  // new reveal interrupts it, so the re-expansion's own height end does not
  // re-anchor mid-open and fight the hold loop.
  const reanchor = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    const panel = panelRef.current
    const pin = pinned.current
    if (!panel || !pin) return
    let frame = 0
    let frames = 0
    let settled = false
    // The last transition frame lands after the loop's final lookup, so the
    // correction is repeated once when the animation reports it is done. The
    // ref survives the loop: the closing pass re-pins it before this effect
    // re-runs, and its cleanup must not have wiped the new anchor by then.
    const settle = (correct: boolean) => {
      if (settled) return
      settled = true
      cancelAnimationFrame(frame)
      if (correct) panel.scrollTop += pin.row.getBoundingClientRect().top - pin.top
    }
    const tick = () => {
      if (settled) return
      panel.scrollTop += pin.row.getBoundingClientRect().top - pin.top
      if (++frames > 120) return settle(false)
      frame = requestAnimationFrame(tick)
    }
    const onEnd = () => settle(true)
    const offEnd = onHeightEnd(pin.row, onEnd)
    tick()
    return () => {
      settle(false)
      offEnd()
    }
    // `revealed` is never read here — its flip is the trigger. The hold loop has
    // to start from a layout effect: the row heights only exist once the commit
    // lands, and a rAF started from the event handler can run before it.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [revealed])

  if (!headings.length) return null

  // The row under the pointer, or the closest one when the pointer sits in the
  // panel's padding or past its ends — both directions need an anchor, and a
  // null here means that open/close cycle drifts instead of compensating.
  const rowAt = (clientY: number) => {
    const panel = panelRef.current
    if (!panel) return null
    let best: HTMLElement | null = null
    let bestDist = Infinity
    for (const row of panel.children) {
      const rect = row.getBoundingClientRect()
      const dist = clientY >= rect.top && clientY < rect.bottom ? 0 : Math.abs(rect.top + rect.height / 2 - clientY)
      if (dist < bestDist) {
        bestDist = dist
        best = row as HTMLElement
      }
    }
    return best
  }

  const reveal = (row: HTMLElement | null) => {
    if (revealed) return
    reanchor.current?.()
    reanchor.current = null
    pinned.current = row && { row, top: row.getBoundingClientRect().top }
    setRevealed(true)
  }

  const conceal = (row: HTMLElement | null) => {
    if (!revealed) return
    // Closing mirrors opening: pin the row the pointer left from, so the list
    // collapses around an anchor and the scroll the reveal borrowed comes back.
    pinned.current = row && { row, top: row.getBoundingClientRect().top }
    setRevealed(false)
    reanchor.current?.()
    const first = panelRef.current?.firstElementChild
    // The rows start collapsing 80ms from now, so the panel only needs its
    // current heading back in view once that has finished.
    reanchor.current = first ? onHeightEnd(first as HTMLElement, keepVisible) : null
  }

  return (
    <>
      <nav
        className="proximity-nav"
        aria-label="文章标题导航"
        data-open={revealed ? '' : undefined}
        onPointerEnter={(event) => reveal(rowAt(event.clientY))}
        onPointerLeave={(event) => conceal(rowAt(event.clientY))}
        onFocusCapture={(event) => reveal((event.target as HTMLElement).closest('.proximity-item'))}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            conceal((event.target as HTMLElement).closest('.proximity-item'))
          }
        }}
      >
        <div className="proximity-rail" aria-hidden="true" />
        <div className="proximity-surface floating-surface bg-background/80" aria-hidden="true" />
        <div className="proximity-panel" ref={panelRef}>
          {headings.map((heading) => (
            <a
              key={heading.id}
              href={`#${encodeURIComponent(heading.id)}`}
              className="proximity-item"
              aria-current={active === heading.id ? 'location' : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                // The panel is a place to pick from, not to watch: the article is
                // already where it belongs the moment the row is chosen.
                scrollToHeading(heading.id, 'instant')
              }}
              style={{ '--level': heading.level } as CSSProperties}
            >
              <span className="proximity-label">{heading.text}</span>
              <span className="proximity-line" />
            </a>
          ))}
        </div>
      </nav>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={(visible) => {
          if (!visible && pendingHeading.current) {
            scrollToHeading(pendingHeading.current)
            pendingHeading.current = null
          }
        }}
      >
        <DrawerTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="floating-surface rounded-xl min-md:hidden max-md:inline-flex max-md:fixed max-md:right-4 max-md:z-20 max-md:bottom-[max(20px,env(safe-area-inset-bottom))]"
              aria-label="文章大纲"
            />
          }
        >
          <ListIcon aria-hidden="true" />
        </DrawerTrigger>
        <DrawerPopup showBar className="max-h-[70dvh]" showCloseButton={false}>
          <DrawerHeader>
            <DrawerTitle>文章大纲</DrawerTitle>
            <DrawerDescription>跳转到文章中的标题</DrawerDescription>
          </DrawerHeader>
          <nav className="mobile-outline-links min-h-0 overflow-auto px-3 pb-6" aria-label="文章标题">
            {headings.map((heading) => (
              <a
                key={heading.id}
                href={`#${encodeURIComponent(heading.id)}`}
                aria-current={active === heading.id ? 'location' : undefined}
                className="block rounded-md py-2.5 pr-4 text-sm no-underline aria-[current=location]:bg-muted"
                style={{ paddingLeft: `${16 + (heading.level - 1) * 12}px` }}
                onClick={(event) => {
                  event.preventDefault()
                  pendingHeading.current = heading.id
                  setOpen(false)
                }}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </DrawerPopup>
      </Drawer>
    </>
  )
}
