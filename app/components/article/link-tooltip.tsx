import { useRef, useState } from 'react'
import { CheckIcon, CopyIcon, ExternalLinkIcon, UnlinkIcon } from 'lucide-react'
import { PopoverPrimitive } from '../ui/popover.tsx'
import { Input } from '../ui/input.tsx'
import { Button } from '../ui/button.tsx'
import type { LinkContext } from '../../lib/milkdown.ts'

interface Props {
  link: LinkContext
  onChange: (href: string) => void
  onRemove: () => void
  onClose: (focusEditor?: boolean) => void
}

// A hover-free link tooltip that follows the caret; edits apply as they are typed,
// which is why there is no confirm button.
export const LinkTooltip = ({ link, onChange, onRemove, onClose }: Props) => {
  const [draft, setDraft] = useState(link.href)
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }
  return (
    <PopoverPrimitive.Popup
      aria-label="链接"
      className="floating-surface flex items-center gap-2 rounded-2xl p-2"
      finalFocus={false}
      initialFocus={false}
    >
      <Input
        aria-label="链接地址"
        className="w-[min(16rem,42vw)] bg-background/80"
        onChange={(event) => {
          const value = event.currentTarget.value
          setDraft(value)
          onChange(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault()
            onClose(true)
          }
        }}
        spellCheck={false}
        type="url"
        value={draft}
      />
      <div className="flex items-center gap-1">
        <Button
          aria-label="打开链接"
          render={<a href={draft || link.href} rel="noreferrer" target="_blank" />}
          size="icon"
          variant="ghost"
        >
          <ExternalLinkIcon aria-hidden="true" />
        </Button>
        <Button aria-label="复制链接" onClick={copy} size="icon" variant="ghost">
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </Button>
        <Button aria-label="移除链接" onClick={onRemove} size="icon" variant="destructive-outline">
          <UnlinkIcon aria-hidden="true" />
        </Button>
      </div>
    </PopoverPrimitive.Popup>
  )
}
