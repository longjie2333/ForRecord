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
import { ContextMenu, ContextMenuPopup } from '../ui/context-menu.tsx'
import { Skeleton } from '../ui/skeleton.tsx'
import { EditorMenu, editorMenuGroups, filterEditorMenu, type EditorMenuItem } from './editor-menu.tsx'
import { MermaidViewer } from './mermaid-viewer.tsx'
import type { MarkdownEditorHandle, SlashContext } from '../../lib/typora.ts'

interface Props {
  content: string
  html?: string
  readOnly: boolean
  sourceMode: boolean
  placeholder?: string
  ref: Ref<MarkdownEditorHandle | null>
  onReady: () => void
  onDirty: (dirty: boolean) => void
  onToggleSource: () => void
}

export const MarkdownEditor = ({
  content,
  html,
  readOnly,
  sourceMode,
  placeholder,
  ref,
  onReady,
  onDirty,
  onToggleSource,
}: Props) => {
  const root = useRef<HTMLDivElement>(null)
  const notifyReady = useEffectEvent(onReady)
  const notifyDirty = useEffectEvent(onDirty)
  const toggleSource = useEffectEvent(onToggleSource)
  const [editor, setEditor] = useState<MarkdownEditorHandle | null>(null)
  const [slash, setSlash] = useState<SlashContext | null>(null)
  const slashRef = useRef<SlashContext | null>(null)
  const [open, setOpen] = useState(false)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const ready = editor !== null
  const editing = !readOnly
  useImperativeHandle<MarkdownEditorHandle | null, MarkdownEditorHandle | null>(ref, () => editor, [editor])
  const [error, setError] = useState('')
  // A rendered diagram opens in the full-screen canvas. The element itself is the
  // source: the viewer clones it, so closing the canvas never touches the note.
  const [diagram, setDiagram] = useState<SVGSVGElement | null>(null)
  // The menu belongs to the editable mode: leaving it drops whatever was open. The
  // editor itself is created once per document, so the mode is applied to the live
  // view and switching it keeps the content, selection and scroll position.
  const [applied, setApplied] = useState(readOnly)
  if (applied !== readOnly) {
    setApplied(readOnly)
    setSlash(null)
    setOpen(false)
    // The canvas belongs to reading: the mode it was opened from is gone.
    setDiagram(null)
  }
  useEffect(() => {
    slashRef.current = null
    editor?.setReadOnly(readOnly)
  }, [readOnly, editor])
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
        instance = await createMarkdownEditor({
          root: root.current!,
          markdown: content,
          readOnly,
          onDirty: (dirty) => notifyDirty(dirty),
          onReport: (report) => reportContext(report),
          onDiagram: (svg) => setDiagram(svg),
        })
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
  }, [content])

  const groups = useMemo(() => (slash ? filterEditorMenu(slash.query) : editorMenuGroups), [slash])
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const select = (id: EditorMenuItem) => {
    slashRef.current = null
    setSlash(null)
    setOpen(false)
    if (id === 'source') toggleSource()
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

  // The surface keeps its element type across modes: the editor DOM lives inside it,
  // and a different tag would remount the ProseMirror view. The menu is anchored to
  // the pointer instead of to a context-menu trigger for the same reason.
  const point = slash ?? menuAt
  const anchor = point && {
    getBoundingClientRect: () => ({
      x: point.x,
      y: point.y,
      left: point.x,
      right: point.x,
      top: point.y,
      bottom: point.y,
      width: 0,
      height: 0,
    }),
  }
  return (
    <div
      className={`markdown-editor ${editing ? 'is-editing' : 'is-reading'} ${sourceMode ? 'is-source' : ''}`}
      onKeyDownCapture={editing && !sourceMode ? handleKeyDown : undefined}
    >
      <ContextMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) return
          slashRef.current = null
          setSlash(null)
          setMenuAt(null)
        }}
      >
        <div
          className="markdown-surface relative"
          onClickCapture={(event) => {
            // A link inside the editor is content, not navigation: following it
            // would drop unsaved edits along with the page.
            if (editing && (event.target as HTMLElement).closest('a[href]')) event.preventDefault()
          }}
          onContextMenu={(event) => {
            // The browser menu only gives way to the editor one in the rendered view.
            if (!editing || sourceMode) return
            event.preventDefault()
            slashRef.current = null
            setSlash(null)
            editor?.selectAt(event.clientX, event.clientY)
            setMenuAt({ x: event.clientX, y: event.clientY })
            setOpen(true)
          }}
        >
          <div
            className="markdown-body typora-root"
            ref={root}
            hidden={!ready && !content}
            dangerouslySetInnerHTML={html ? { __html: html } : undefined}
          />
          {!ready && !content && (
            // Skeleton matching the article's reading rhythm (body leading is 1.9)
            // so the swap to real content doesn't shift the layout.
            <div aria-hidden="true" className="flex flex-col gap-3.5 py-1">
              <Skeleton className="h-7 w-56 max-w-full" />
              <Skeleton className="mt-1 h-5 w-50" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[92%]" />
              <Skeleton className="mt-1 h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[76%]" />
            </div>
          )}
          {ready && !sourceMode && placeholder && (
            <p className="pointer-events-none absolute top-0 left-0 m-0 text-[15px] leading-[1.9] text-muted-foreground max-md:text-[13px]">
              {placeholder}
            </p>
          )}
        </div>
        {editing && !sourceMode && (
          <ContextMenuPopup
            align={slash ? 'start' : 'center'}
            anchor={anchor}
            aria-label="编辑操作"
            className="floating-surface bg-background/80"
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
        <p role="alert" className="text-[12px] text-muted-foreground">
          {error}
        </p>
      )}
      <MermaidViewer svg={diagram} onClose={() => setDiagram(null)} />
    </div>
  )
}
