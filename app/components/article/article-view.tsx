import { useState, type DragEvent, type Ref } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { MarkdownEditor } from './markdown-editor.tsx'
import type { MarkdownEditorHandle } from '../../lib/typora.ts'

export const ArticleView = ({
  error,
  author,
  date,
  notice,
  onDismissNotice,
  revision,
  content,
  html,
  editing,
  isNew,
  writing,
  bodyDirty,
  editorRef,
  onEditorReady,
  onEditorDirty,
  onEditSource,
  onDropFiles,
}: {
  error?: string
  author: string
  date: string
  notice: string
  onDismissNotice: () => void
  revision: number
  content: string
  html: string
  editing: boolean
  isNew: boolean
  writing: boolean
  bodyDirty: boolean
  editorRef: Ref<MarkdownEditorHandle | null>
  onEditorReady: () => void
  onEditorDirty: (dirty: boolean) => void
  onEditSource: () => void
  onDropFiles: (files: FileList) => void
}) => {
  const [dropActive, setDropActive] = useState(false)
  return (
    <main id="content" className="article-container" tabIndex={-1}>
      {notice && (
        <div
          role="alert"
          className="notice mb-6 flex items-center justify-between gap-3 rounded-lg border bg-muted px-3 py-2.5 text-[13px]"
        >
          <span>{notice}</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭提示" onClick={onDismissNotice}>
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}
      {error ? (
        <div className="py-[60px]">
          <span className="font-mono text-xs text-muted-foreground">404</span>
          <h1 className="my-4 text-[26px] font-semibold">{error}</h1>
          <p className="mb-6 text-sm text-muted-foreground">从左侧目录选择一篇笔记，或返回首页。</p>
          <Button render={<a href="/" />}>返回首页</Button>
        </div>
      ) : (
        <>
          <div className="article-meta mb-[26px] flex items-center gap-2.5 text-[11px] tracking-wide text-muted-foreground max-md:mb-6 max-md:text-[10px]">
            <span>{author}</span>
            <span className="opacity-55">·</span>
            <time dateTime={date}>{date || '今天'}</time>
          </div>
          <article
            className={dropActive ? 'drop-active' : ''}
            inert={writing}
            onDragOver={(event) => {
              if (editing && event.dataTransfer.types.includes('Files')) {
                event.preventDefault()
                setDropActive(isNew)
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropActive(false)
            }}
            onDropCapture={
              editing
                ? (event: DragEvent) => {
                    if (!event.dataTransfer.types.includes('Files')) return
                    event.preventDefault()
                    event.stopPropagation()
                    setDropActive(false)
                    onDropFiles(event.dataTransfer.files)
                  }
                : undefined
            }
          >
            <MarkdownEditor
              key={revision}
              content={content}
              html={revision === 0 ? html : ''}
              editing={editing}
              placeholder={isNew && !content && !bodyDirty ? '开始写作，或将 .md 文件拖到这里' : undefined}
              ref={editorRef}
              onReady={onEditorReady}
              onDirty={onEditorDirty}
              onSource={onEditSource}
            />
          </article>
          {!editing && (
            <div className="mt-[72px] flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="h-px w-[22px] bg-input" />
              记录于此。
            </div>
          )}
        </>
      )}
    </main>
  )
}
