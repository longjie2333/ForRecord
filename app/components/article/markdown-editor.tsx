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
import { EditorMenu, editorMenuGroups, filterEditorMenu, type EditorMenuItem } from './editor-menu.tsx'
import type { MarkdownEditorHandle, SlashContext } from '../../lib/typora.ts'

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
  const ready = editor !== null
  useImperativeHandle<MarkdownEditorHandle | null, MarkdownEditorHandle | null>(ref, () => editor, [editor])
  const [error, setError] = useState('')
  // The editor reports the slash state from its own transactions, after the document
  // and selection are current.
  const reportContext = useEffectEvent((nextSlash: SlashContext | null) => {
    if (!nextSlash && slashRef.current) setOpen(false)
    slashRef.current = nextSlash
    setSlash(nextSlash)
    setActiveIndex(0)
    if (nextSlash) setOpen(true)
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
        const { createMarkdownEditor } = await import('../../lib/typora.ts')
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
            // A link inside the editor is content, not navigation: following it
            // would drop unsaved edits along with the page.
            if (editing && (event.target as HTMLElement).closest('a[href]')) event.preventDefault()
          }}
          onContextMenu={(event) => {
            if (!editing) return
            slashRef.current = null
            setSlash(null)
            editor?.selectAt(event.clientX, event.clientY)
          }}
        >
          {!ready && <div className="markdown-body server-content" dangerouslySetInnerHTML={{ __html: html }} />}
          <div className="markdown-body typora-root" ref={root} hidden={!ready} />
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
      {error && (
        <p role="alert" className="editor-message text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  )
}
