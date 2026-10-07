import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react'
import {
  BookOpenIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilLineIcon,
  ArrowUpRightIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
  FileCodeIcon,
} from 'lucide-react'
import { Button } from './components/ui/button.tsx'
import { Input } from './components/ui/input.tsx'
import { Field, FieldLabel } from './components/ui/field.tsx'
import { Sheet, SheetPopup, SheetTitle, SheetDescription, SheetTrigger, SheetClose } from './components/ui/sheet.tsx'
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from './components/ui/alert-dialog.tsx'
import { Sidebar } from './components/sidebar.tsx'
import { MarkdownEditor } from './components/markdown-editor.tsx'
import { ProximityNavigation } from './components/proximity-navigation.tsx'
import { SaveDialog } from './components/save-dialog.tsx'
import { SourceDialog } from './components/source-dialog.tsx'
import { DatePicker } from './components/date-picker.tsx'
import type { MarkdownEditorHandle } from './lib/milkdown.ts'
import { postHref, today, type PageData, type PostInput } from '../shared/posts.ts'

const importKey = 'for-record:import'

export const App = ({ data }: { data: PageData }) => {
  const { post, editing, isNew, site } = data
  const [draft, setDraft] = useState<PostInput>({
    title: post?.title ?? '',
    content: post?.content ?? '',
    createon: post?.createon ?? '',
  })
  const [revision, setRevision] = useState(0)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveMode, setSaveMode] = useState<'save' | 'delete' | null>(null)
  const [sessionExpiresAt, setSessionExpiresAt] = useState(data.sessionExpiresAt)
  const [authenticated, setAuthenticated] = useState(data.sessionExpiresAt > 0)
  const [writing, setWriting] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(data.sidebar.width)
  const [collapsed, setCollapsed] = useState(data.sidebar.collapsed)
  const [resizing, setResizing] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [headings, setHeadings] = useState(data.headings)
  const editor = useRef<MarkdownEditorHandle | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const allowLeave = useRef(false)
  const initialized = useRef(false)
  const dirty =
    editing &&
    (bodyDirty ||
      draft.title !== (post?.title ?? '') ||
      draft.content !== (post?.content ?? '') ||
      (!isNew && draft.createon !== post?.createon))
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    const timer = window.setTimeout(() => setAuthenticated(false), Math.max(0, sessionExpiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [sessionExpiresAt])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && !allowLeave.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const saveSidebar = (width: number, closed: boolean) => {
    setSidebarWidth(width)
    setCollapsed(closed)
    document.cookie = `for-record-sidebar=${width}:${closed ? 1 : 0}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  const perform = (action: () => void) => {
    if (dirtyRef.current) setPending(() => action)
    else action()
  }
  const leave = (href: string) => {
    allowLeave.current = true
    window.location.assign(href)
  }
  const guardNavigation = (event: MouseEvent) => {
    if (!dirty || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
    if (
      !link ||
      link.target === '_blank' ||
      link.hasAttribute('download') ||
      link.getAttribute('href')?.startsWith('#')
    )
      return
    event.preventDefault()
    event.stopPropagation()
    setPending(() => () => leave(link.href))
  }
  const importFile = async (file: File, target: 'new' | 'editor') => {
    setDropActive(false)
    if (!/\.md$/i.test(file.name)) {
      setNotice('只能导入 .md 格式的 Markdown 文件。')
      return
    }
    if (target === 'editor' && (!isNew || editor.current?.getMarkdown().trim())) {
      setNotice('请把文件拖到“新增文章”，或拖到空白文章的编辑器中。')
      return
    }
    try {
      const imported: PostInput = {
        title: file.name.replace(/\.md$/i, ''),
        content: await file.text(),
        createon: today(),
      }
      perform(() => {
        if (isNew) {
          setReady(false)
          setDraft(imported)
          setRevision((value) => value + 1)
          setNotice('')
        } else {
          try {
            sessionStorage.setItem(importKey, JSON.stringify(imported))
            leave('/post/new/edit')
          } catch {
            setNotice('文件暂存失败，请先打开空白文章，再拖入文件。')
          }
        }
      })
    } catch {
      setNotice('文件读取失败，请重新选择。')
    }
  }
  const onDrop = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    setDropActive(false)
    if (event.dataTransfer.files.length !== 1) {
      setNotice('请一次导入一个 .md 文件。')
      return
    }
    void importFile(event.dataTransfer.files[0], 'editor')
  }
  const editorReady = () => {
    if (!initialized.current) {
      initialized.current = true
      if (isNew) {
        const date = today()
        setDraft((draftValue) => ({ ...draftValue, createon: draftValue.createon || date }))
        try {
          const imported = sessionStorage.getItem(importKey)
          sessionStorage.removeItem(importKey)
          if (imported) {
            const importedPost: PostInput = JSON.parse(imported)
            if (typeof importedPost.title === 'string' && typeof importedPost.content === 'string') {
              setDraft({ ...importedPost, createon: date })
              setRevision((revisionValue) => revisionValue + 1)
              return
            }
          }
        } catch {
          setNotice('导入内容无法读取，请重新选择 .md 文件。')
        }
      }
    }
    setReady(true)
    if (!editing) {
      setHeadings(
        Array.from(
          document.querySelectorAll<HTMLElement>('.milkdown-root .ProseMirror :is(h1,h2,h3,h4,h5,h6)'),
          (element) => {
            return { id: element.id, text: element.textContent ?? '', level: Number(element.tagName[1]) }
          },
        ),
      )
      if (window.location.hash) {
        try {
          const id = decodeURIComponent(window.location.hash.slice(1))
          requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView())
        } catch {
          /* A malformed fragment does not identify a heading. */
        }
      }
    }
  }
  const submit = async (mode: 'save' | 'delete', code?: string) => {
    setWriting(true)
    try {
      if (code) {
        const auth = await fetch('/api/session', { method: 'POST', headers: { Code: code } })
        const session = (await auth.json()) as { expiresAt: number; message?: string }
        if (!auth.ok) throw new Error(session.message || '验证失败，请重试')
        setSessionExpiresAt(session.expiresAt)
        setAuthenticated(true)
      }
      const deleting = mode === 'delete'
      const response = await fetch(isNew ? '/api/posts' : `/api/posts/${post!.id}`, {
        method: deleting ? 'DELETE' : isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(!deleting ? { body: JSON.stringify({ ...draft, content: editor.current!.getMarkdown() }) } : {}),
      })
      const result = (await response.json()) as { success?: boolean; id: number; message?: string }
      if (response.status === 401) {
        setSessionExpiresAt(0)
        setAuthenticated(false)
        setSaveMode(mode)
      }
      if (!response.ok || !result.success) throw new Error(result.message || '保存失败，请重试')
      allowLeave.current = true
      window.location.replace(postHref(deleting ? 1 : result.id, true))
    } finally {
      setWriting(false)
    }
  }
  const sidebarProps = {
    posts: data.posts,
    selected: post?.id,
    editing,
    isNew,
    onImport: (file: File, target: 'new') => {
      void importFile(file, target)
    },
  }
  const openSource = () => setSource(editor.current!.getMarkdown())

  return (
    <div
      className={`blog-layout ${collapsed ? 'sidebar-collapsed' : ''} ${editing ? 'editing-layout' : ''} ${resizing ? 'resizing' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      onClickCapture={guardNavigation}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
    >
      <a className="skip-link" href="#content">
        跳到正文
      </a>
      <aside className="desktop-sidebar" aria-label="笔记侧边栏" inert={collapsed}>
        <Sidebar
          {...sidebarProps}
          collapseControl={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="收起侧边栏"
              title="收起侧边栏"
              onClick={() => saveSidebar(sidebarWidth, true)}
            >
              <PanelLeftCloseIcon aria-hidden="true" />
            </Button>
          }
        />
      </aside>
      {!collapsed && (
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="调整侧边栏宽度"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={480}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onDoubleClick={() => saveSidebar(304, false)}
          onKeyDown={(event) => {
            const sizes: Record<string, number> = {
              ArrowLeft: sidebarWidth - 16,
              ArrowRight: sidebarWidth + 16,
              Home: 220,
              End: 480,
            }
            if (event.key in sizes) {
              event.preventDefault()
              saveSidebar(Math.min(480, Math.max(220, sizes[event.key])), false)
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            setResizing(true)
          }}
          onPointerMove={(event) => {
            if (resizing) setSidebarWidth(Math.max(220, Math.min(480, window.innerWidth / 2, event.clientX)))
          }}
          onPointerUp={() => {
            setResizing(false)
            saveSidebar(sidebarWidth, false)
          }}
          onPointerCancel={() => setResizing(false)}
        />
      )}
      <div className="content-column">
        <div className="floating-actions floating-surface floating-rounded" role="group" aria-label="文章操作">
          {collapsed && (
            <Button
              className="desktop-sidebar-toggle"
              variant="ghost"
              size="icon"
              aria-label="展开侧边栏"
              onClick={() => saveSidebar(sidebarWidth, false)}
            >
              <PanelLeftOpenIcon aria-hidden="true" />
            </Button>
          )}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mobile-sidebar-toggle"
                  aria-label="打开文章目录"
                />
              }
            >
              <PanelLeftOpenIcon aria-hidden="true" />
            </SheetTrigger>
            <SheetPopup side="left" className="mobile-sidebar" showCloseButton={false}>
              <SheetTitle className="sr-only">文章目录</SheetTitle>
              <SheetDescription className="sr-only">浏览和管理笔记</SheetDescription>
              <Sidebar
                {...sidebarProps}
                collapseControl={
                  <SheetClose render={<Button type="button" variant="ghost" size="icon" aria-label="关闭文章目录" />}>
                    <PanelLeftCloseIcon aria-hidden="true" />
                  </SheetClose>
                }
              />
            </SheetPopup>
          </Sheet>
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="编辑源码"
                title="编辑源码"
                onClick={openSource}
              >
                <FileCodeIcon aria-hidden="true" />
              </Button>
              {isNew && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="导入 Markdown 文件"
                  title="导入 Markdown 文件"
                  onClick={() => fileInput.current?.click()}
                >
                  <UploadIcon aria-hidden="true" />
                </Button>
              )}
              <Button variant="ghost" size="icon" render={<a href={postHref(post?.id ?? 1)} />}>
                <BookOpenIcon aria-hidden="true" />
              </Button>
            </>
          ) : (
            !data.error && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  render={<a href={`/post/${post?.id}.md`} />}
                  aria-label="查看 Markdown 源文"
                  title="查看 Markdown 源文"
                >
                  <ArrowUpRightIcon aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" render={<a href={postHref(post?.id ?? 1, true)} />}>
                  <PencilLineIcon aria-hidden="true" />
                </Button>
              </>
            )
          )}
        </div>
        <main id="content" className="article-container" tabIndex={-1}>
          {notice && (
            <div
              role="alert"
              className="notice mb-6 flex items-center justify-between gap-3 rounded-lg border bg-muted px-3 py-2.5 text-[13px]"
            >
              <span>{notice}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭提示" onClick={() => setNotice('')}>
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          )}
          {data.error ? (
            <div className="py-[60px]">
              <span className="font-mono text-xs text-muted-foreground">404</span>
              <h1 className="my-4 text-[26px] font-semibold">{data.error}</h1>
              <p className="mb-6 text-sm text-muted-foreground">从左侧目录选择一篇笔记，或返回首页。</p>
              <Button render={<a href="/" />}>返回首页</Button>
            </div>
          ) : (
            <>
              <div className="article-meta mb-[26px] flex items-center gap-2.5 text-[11px] tracking-wide text-muted-foreground max-md:mb-6 max-md:text-[10px]">
                <span>{site.author}</span>
                <span className="opacity-55">·</span>
                <time dateTime={draft.createon}>{draft.createon || '今天'}</time>
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
                onDropCapture={editing ? onDrop : undefined}
              >
                <MarkdownEditor
                  key={revision}
                  content={draft.content}
                  html={revision === 0 ? data.html : ''}
                  editing={editing}
                  placeholder={isNew && !draft.content && !bodyDirty ? '开始写作，或将 .md 文件拖到这里' : undefined}
                  ref={editor}
                  onReady={editorReady}
                  onDirty={setBodyDirty}
                  onSource={openSource}
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
        {!editing && !data.error && <ProximityNavigation headings={headings} />}
        {editing && (
          <form
            className="edit-footer floating-surface"
            onSubmit={(event) => {
              event.preventDefault()
              if (!draft.createon) {
                setNotice('请选择文章日期')
                return
              }
              if (sessionExpiresAt > Date.now()) void submit('save').catch((error) => setNotice(error.message))
              else setSaveMode('save')
            }}
          >
            <Field className="title-field">
              <FieldLabel>标题</FieldLabel>
              <Input
                className="bg-background/80"
                type="text"
                value={draft.title}
                required
                readOnly={post?.id === 1}
                disabled={writing}
                placeholder="例如：生活 / 一些小事"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>
            <Field className="date-field">
              <FieldLabel htmlFor="post-date">日期</FieldLabel>
              <DatePicker
                id="post-date"
                value={draft.createon}
                disabled={writing}
                onChange={(createon) => setDraft({ ...draft, createon })}
              />
            </Field>
            <div className="save-actions flex items-center justify-end gap-2">
              {!isNew && post?.id !== 1 && (
                <Button
                  type="button"
                  variant="destructive-outline"
                  size="icon"
                  aria-label="删除文章"
                  title="删除文章"
                  onClick={() => setSaveMode('delete')}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              )}
              <Button type="submit" disabled={!ready} loading={writing}>
                <SaveIcon aria-hidden="true" />
                保存
              </Button>
            </div>
          </form>
        )}
      </div>
      <input
        type="file"
        accept=".md"
        hidden
        ref={fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importFile(file, 'editor')
          event.target.value = ''
        }}
      />
      <SaveDialog
        mode={saveMode}
        authenticated={authenticated}
        onClose={() => setSaveMode(null)}
        onSubmit={(code) => submit(saveMode!, code)}
      />
      <SourceDialog
        value={source}
        onClose={() => setSource(null)}
        onApply={(content) => {
          if (content !== editor.current!.getMarkdown()) {
            setReady(false)
            setDraft({ ...draft, content })
            setRevision((value) => value + 1)
            setBodyDirty(false)
          }
          setSource(null)
        }}
      />
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>这篇笔记有尚未保存的内容。继续后，这些修改将丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter variant="bare">
            <AlertDialogClose render={<Button type="button" variant="ghost" />}>继续编辑</AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const action = pending
                setPending(null)
                action?.()
              }}
            >
              放弃修改并继续
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
