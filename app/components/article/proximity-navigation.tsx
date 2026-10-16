import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ListIcon, XIcon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import {
  Drawer,
  DrawerClose,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from '../ui/drawer.tsx'
import type { Heading } from '../../../shared/posts.ts'

export const ProximityNavigation = ({ headings }: { headings: Heading[] }) => {
  const [active, setActive] = useState(headings[0]?.id)
  const [nearby, setNearby] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const pendingHeading = useRef<string | null>(null)
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (!element) return
    history.pushState(null, '', `#${encodeURIComponent(id)}`)
    element.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    })
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

  useEffect(() => {
    const nav = navRef.current
    const item = nav?.querySelector<HTMLAnchorElement>(`a[href="#${encodeURIComponent(active ?? '')}"]`)
    if (!nav || !item) return
    // Scroll only the rail, without moving the article.
    if (item.offsetTop < nav.scrollTop) nav.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > nav.scrollTop + nav.clientHeight) {
      nav.scrollTop = item.offsetTop + item.offsetHeight - nav.clientHeight
    }
  }, [active])

  if (!headings.length) return null
  return (
    <>
      <nav className="proximity-nav" aria-label="文章标题导航" ref={navRef} onPointerLeave={() => setNearby(null)}>
        {headings.map((heading, index) => (
          <a
            key={heading.id}
            href={`#${encodeURIComponent(heading.id)}`}
            className="proximity-item"
            aria-current={active === heading.id ? 'location' : undefined}
            aria-label={heading.text}
            onPointerEnter={() => setNearby(index)}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              scrollToHeading(heading.id)
            }}
            style={
              {
                '--level': heading.level,
                '--proximity': nearby === null ? 0 : Math.max(0, 1 - Math.abs(index - nearby) / 3),
              } as CSSProperties
            }
          >
            <span className="proximity-label">{heading.text}</span>
            <span className="proximity-line" />
          </a>
        ))}
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
              className="mobile-outline floating-surface floating-rounded"
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
          <DrawerClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10"
                aria-label="关闭大纲"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </DrawerClose>
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
