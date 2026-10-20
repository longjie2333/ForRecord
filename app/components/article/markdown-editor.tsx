import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { ContextMenu, ContextMenuPopup, ContextMenuTrigger } from '../ui/context-menu.tsx'
import { PopoverPrimitive } from '../ui/popover.tsx'
import { EditorMenu, editorMenuGroups, filterEditorMenu, type EditorMenuItem } from './editor-menu.tsx'
import { LinkTooltip } from './link-tooltip.tsx'
import type { EditorReport, LinkContext, MarkdownEditorHandle, SlashContext } from '../../lib/milkdown.ts'

interface Props {
  content: string
  html: string
  editing: boolean
  placeholder?: string
  ref: Ref<MarkdownEditorHandle | null>
  onReady: () => void
  onDirty: (dirty: boolean) => void
  onSource: () => void
}

export const MarkdownEditor = ({ content, html, editing, placeholder, ref, onReady, onDirty, onSource }: Props) => {
  const root = useRef<HTMLDivElement>(null)
  const notifyReady = useEffectEvent(onReady)
  const notifyDirty = useEffectEvent(onDirty)
  const openSource = useEffectEvent(onSource)
  const [editor, setEditor] = useState<MarkdownEditorHandle | null>(null)
  const [slash, setSlash] = useState<SlashContext | null>(null)
  const slashRef = useRef<SlashContext | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [link, setLink] = useState<LinkContext | null>(null)
  const linkRef = useRef<LinkContext | null>(null)
  // A tooltip the user dismissed stays closed until the caret leaves the link.
  const dismissed = useRef<string | null>(null)
  const ready = editor !== null
  useImperativeHandle<MarkdownEditorHandle | null, MarkdownEditorHandle | null>(ref, () => editor, [editor])
  const [error, setError] = useState('')
  // The editor reports the slash and link state from its own transactions, after the
  // document and selection are current.
  const reportContext = useEffectEvent((report: EditorReport) => {
    const nextSlash = report.slash
    if (!nextSlash && slashRef.current) setOpen(false)
    slashRef.current = nextSlash
    setSlash(nextSlash)
    setActiveIndex(0)
    if (nextSlash) setOpen(true)

    const nextLink = report.link
    if (!nextLink) {
      dismissed.current = null
      linkRef.current = null
      setLink(null)
      return
    }
    if (dismissed.current === `${nextLink.from}:${nextLink.to}`) return
    linkRef.current = nextLink
    setLink(nextLink)
  })
  const closeLink = useEffectEvent((focusEditor?: boolean) => {
    if (linkRef.current) dismissed.current = `${linkRef.current.from}:${linkRef.current.to}`
    setLink(null)
    // Closing from the tooltip's own input has to hand the caret back, otherwise
    // keystrokes land nowhere.
    if (focusEditor) editor?.focus()
  })
  // The menu focuses itself when it mounts, which would swallow every keystroke and
  // stop the filter from updating. It focuses on an animation frame, so this runs on
  // the next task to hand the caret back to the editor.
  useEffect(() => {
    if (!open || !slash) return
    const timer = window.setTimeout(() => editor?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open, slash, editor])
  useEffect(() => {
    if (import.meta.env.SSR) return
    let cancelled = false
    let instance: MarkdownEditorHandle | undefined
    const mount = async () => {
      try {
        const { createMarkdownEditor } = await import('../../lib/milkdown.ts')
        if (cancelled) return
        instance = await createMarkdownEditor(
          root.current!,
          content,
          editing,
          (dirty) => notifyDirty(dirty),
          (report) => reportContext(report),
        )
        if (cancelled) {
          await instance.destroy()
          return
        }
        setEditor(instance)
        notifyReady()
      } catch (cause) {
        if (!cancelled) setError('编辑器加载失败，请刷新重试。')
        console.error(cause)
      }
    }
    void mount()
    return () => {
      cancelled = true
      void instance?.destroy()
    }
  }, [content, editing])

  const groups = useMemo(() => (slash ? filterEditorMenu(slash.query) : editorMenuGroups), [slash])
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const select = (id: EditorMenuItem) => {
    slashRef.current = null
    setSlash(null)
    setOpen(false)
    if (id === 'source') openSource()
    else if (slash) editor?.runSlash(slash, id)
    else editor?.command(id)
  }
  const moveWithin = (delta: number) => {
    if (!items.length) return
    setActiveIndex((index) => (index + delta + items.length) % items.length)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // While an IME is composing, Enter/arrows belong to the candidate window.
    if (!slash || event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      moveWithin(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const item = items[activeIndex]
      if (item) select(item.id)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      slashRef.current = null
      setSlash(null)
      setOpen(false)
    }
  }

  const Surface = editing ? ContextMenuTrigger : 'div'
  return (
    <div
      className={`markdown-editor ${editing ? 'is-editing' : 'is-reading'}`}
      onKeyDownCapture={editing ? handleKeyDown : undefined}
    >
      <ContextMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            slashRef.current = null
            setSlash(null)
          }
        }}
      >
        <Surface
          className="editor-surface"
          onClickCapture={(event) => {
            // A link inside the editor is content: clicking it opens the tooltip
            // instead of leaving the page mid-edit.
            if (editing && (event.target as HTMLElement).closest('a[href]')) event.preventDefault()
          }}
          onContextMenu={(event) => {
            if (!editing) return
            slashRef.current = null
            setSlash(null)
            editor?.selectAt(event.clientX, event.clientY)
          }}
          onMouseUp={() => {
            if (!editing) return
            // Clicking a link asks for its tooltip, even right after dismissing one.
            const context = editor?.linkContext()
            if (!context) return
            dismissed.current = null
            linkRef.current = context
            setLink(context)
          }}
        >
          {!ready && <div className="markdown-body server-content" dangerouslySetInnerHTML={{ __html: html }} />}
          <div className="markdown-body milkdown-root" ref={root} hidden={!ready} />
          {ready && placeholder && <p className="empty-editor-hint">{placeholder}</p>}
        </Surface>
        {editing && (
          <ContextMenuPopup
            align={slash ? 'start' : 'center'}
            anchor={
              slash
                ? {
                    getBoundingClientRect: () => ({
                      x: slash.x,
                      y: slash.y,
                      left: slash.x,
                      right: slash.x,
                      top: slash.y,
                      bottom: slash.y,
                      width: 0,
                      height: 0,
                    }),
                  }
                : undefined
            }
            aria-label="编辑操作"
            sideOffset={slash ? 6 : 4}
          >
            <EditorMenu
              activeId={slash ? (items[activeIndex]?.id ?? null) : null}
              disabled={!ready}
              groups={groups}
              nested={!slash}
              onSelect={select}
            />
          </ContextMenuPopup>
        )}
      </ContextMenu>
      {editing && (
        <PopoverPrimitive.Root
          open={link !== null}
          onOpenChange={(next) => {
            if (!next) closeLink()
          }}
        >
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner
              align="start"
              anchor={
                link
                  ? {
                      // Ask the editor each time so the tooltip follows the link
                      // when the page scrolls.
                      getBoundingClientRect: () =>
                        (editor?.linkRect(link) ?? {
                          x: link.x,
                          y: link.y,
                          left: link.x,
                          right: link.x + link.width,
                          top: link.y,
                          bottom: link.y,
                          width: link.width,
                          height: 0,
                        }) as DOMRect,
                    }
                  : undefined
              }
              className="z-50"
              side="top"
              sideOffset={8}
            >
              {link && (
                <LinkTooltip
                  key={`${link.from}:${link.to}`}
                  link={link}
                  onChange={(href) => editor?.setLink(link, href)}
                  onClose={closeLink}
                  onRemove={() => {
                    editor?.removeLink(link)
                    closeLink()
                  }}
                />
              )}
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      )}
      {error && (
        <p role="alert" className="editor-message text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  )
}
