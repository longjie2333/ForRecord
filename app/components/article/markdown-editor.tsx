import {
  lazy,
  Suspense,
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
import type { MarkdownEditorHandle, SlashContext } from '../../lib/typora.ts'

const MermaidViewer = lazy(async () => ({ default: (await import('./mermaid-viewer.tsx')).MermaidViewer }))

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
  const [diagram, setDiagram] = useState<SVGSVGElement | null>(null)
  const [viewerLoaded, setViewerLoaded] = useState(false)
  // Sync during render rather than in an effect: the editor is created once per document,
  // so a mode switch drops whatever was open without remounting it.
  const [applied, setApplied] = useState(readOnly)
  if (applied !== readOnly) {
    setApplied(readOnly)
    setSlash(null)
    setOpen(false)
    setDiagram(null)
  }
  useEffect(() => {
    slashRef.current = null
    editor?.setReadOnly(readOnly)
  }, [readOnly, editor])
  const reportContext = useEffectEvent((nextSlash: SlashContext | null) => {
    if (!nextSlash && slashRef.current) setOpen(false)
    slashRef.current = nextSlash
    setSlash(nextSlash)
    setActiveIndex(0)
    if (nextSlash) setOpen(true)
  })
  // The menu focuses itself on mount, which would swallow keystrokes and freeze the filter;
  // it does so on an animation frame, so the caret goes back on the next task.
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
          onDiagram: (svg) => {
            setViewerLoaded(true)
            setDiagram(svg)
          },
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
    // oxlint-disable-next-line react/exhaustive-effect-dependencies react-hooks/exhaustive-deps
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

  // The surface keeps its element type across modes — another tag would remount the
  // ProseMirror view — and the menu anchors to the pointer for the same reason.
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
            // A link in the editor is content, not navigation: following it would drop the edits.
            if (editing && (event.target as HTMLElement).closest('a[href]')) event.preventDefault()
          }}
          onContextMenu={(event) => {
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
      {/* Loaded by the first diagram click and kept, so closing still fades out. */}
      {viewerLoaded && (
        <Suspense>
          <MermaidViewer svg={diagram} onClose={() => setDiagram(null)} />
        </Suspense>
      )}
    </div>
  )
}
