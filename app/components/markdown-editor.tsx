import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from 'react'
import {
  BoldIcon,
  ItalicIcon,
  Heading2Icon,
  ListIcon,
  QuoteIcon,
  Undo2Icon,
  Redo2Icon,
  CodeIcon,
  FileCodeIcon,
  PilcrowIcon,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuPopup,
  ContextMenuItem,
  ContextMenuSeparator,
} from './ui/context-menu.tsx'
import type { MarkdownEditorHandle } from '../lib/milkdown.ts'

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
  const [editor, setEditor] = useState<MarkdownEditorHandle | null>(null)
  const ready = editor !== null
  useImperativeHandle<MarkdownEditorHandle | null, MarkdownEditorHandle | null>(ref, () => editor, [editor])
  const [error, setError] = useState('')
  useEffect(() => {
    if (import.meta.env.SSR) return
    let cancelled = false
    let instance: MarkdownEditorHandle | undefined
    const mount = async () => {
      try {
        const { createMarkdownEditor } = await import('../lib/milkdown.ts')
        if (cancelled) return
        instance = await createMarkdownEditor(root.current!, content, editing, (dirty) => notifyDirty(dirty))
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

  const actions = [
    ['bold', '加粗', BoldIcon],
    ['italic', '斜体', ItalicIcon],
    ['heading', '二级标题', Heading2Icon],
    ['paragraph', '正文', PilcrowIcon],
    ['list', '无序列表', ListIcon],
    ['quote', '引用', QuoteIcon],
    ['code', '代码块', CodeIcon],
    ['undo', '撤销', Undo2Icon],
    ['redo', '重做', Redo2Icon],
  ] as const
  const Surface = editing ? ContextMenuTrigger : 'div'
  return (
    <div className={`markdown-editor ${editing ? 'is-editing' : 'is-reading'}`}>
      <ContextMenu>
        <Surface
          className="editor-surface"
          onContextMenu={(event) => {
            if (editing) editor?.selectAt(event.clientX, event.clientY)
          }}
        >
          {!ready && <div className="markdown-body server-content" dangerouslySetInnerHTML={{ __html: html }} />}
          <div className="markdown-body milkdown-root" ref={root} hidden={!ready} />
          {ready && placeholder && <p className="empty-editor-hint">{placeholder}</p>}
        </Surface>
        {editing && (
          <ContextMenuPopup aria-label="编辑操作">
            {actions.map(([action, label, Icon]) => (
              <ContextMenuItem key={action} disabled={!ready} onClick={() => editor?.command(action)}>
                <Icon aria-hidden="true" />
                {label}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem disabled={!ready} onClick={onSource}>
              <FileCodeIcon aria-hidden="true" />
              编辑源码
            </ContextMenuItem>
          </ContextMenuPopup>
        )}
      </ContextMenu>
      {editing && !ready && !error && (
        <p role="status" className="editor-message">
          正在载入编辑器…
        </p>
      )}
      {error && (
        <p role="alert" className="editor-message text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  )
}
