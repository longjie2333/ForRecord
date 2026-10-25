import { useEffect, useEffectEvent, useRef, useState, type MouseEvent } from 'react'
import { headingText, postHref, today, type Heading, type Post, type PostInput } from '../../shared/posts.ts'
import type { MarkdownEditorHandle } from './typora.ts'

const importKey = 'for-record:import'

// Reading and writing are the same document: `readOnly` only decides whether the editor
// accepts input, so one request serves both modes.
export const useArticle = ({
  post,
  readOnly: initialReadOnly,
  isNew,
  sessionExpiresAt: initialSessionExpiresAt,
}: {
  post: Post | null
  readOnly: boolean
  isNew: boolean
  sessionExpiresAt: number
}) => {
  const [draft, setDraft] = useState<PostInput>({
    title: post?.title ?? '',
    content: post?.content ?? '',
    createon: post?.createon ?? '',
  })
  const [readOnly, setMode] = useState(initialReadOnly)
  const editing = !readOnly
  const [revision, setRevision] = useState(0)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveMode, setSaveMode] = useState<'save' | 'delete' | null>(null)
  const [sessionExpiresAt, setSessionExpiresAt] = useState(initialSessionExpiresAt)
  const [authenticated, setAuthenticated] = useState(initialSessionExpiresAt > 0)
  const [writing, setWriting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const editor = useRef<MarkdownEditorHandle | null>(null)
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

  const updateDraft = (values: Partial<PostInput>) => setDraft((current) => ({ ...current, ...values }))
  const dismissNotice = () => setNotice('')
  const closeSaveDialog = () => setSaveMode(null)
  const refreshHeadings = () =>
    setHeadings(
      Array.from(
        document.querySelectorAll<HTMLElement>('.typora-root .ProseMirror :is(h1,h2,h3,h4,h5,h6)'),
        (element) => ({ id: element.id, text: headingText(element), level: Number(element.tagName[1]) }),
      ),
    )
  // Switching modes keeps the document and the editor; only the address changes, so a
  // reload or a shared link opens the mode on screen. The editor applies the mode first,
  // since anchoring the headings is what the outline reads.
  const setReadOnly = (next: boolean) => {
    if (!post || next === readOnly) return
    editor.current?.setReadOnly(next)
    setMode(next)
    // The editor ends source mode itself when it becomes read-only.
    if (next) setSourceMode(false)
    window.history.replaceState(window.history.state, '', postHref(post.id, !next))
    if (next) refreshHeadings()
  }
  // Run it now, or hold it until the reader confirms discarding unsaved edits.
  const guarded = (action: () => void) => {
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
  const cancelPending = () => setPending(null)
  const confirmPending = () => {
    const action = pending
    setPending(null)
    action?.()
  }
  const importFile = async (file: File, target: 'new' | 'editor') => {
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
      guarded(() => {
        if (isNew) {
          setReady(false)
          setDraft(imported)
          // The editor is remounted for the imported text, so the view swap ends.
          setSourceMode(false)
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
  const importPost = (file: File) => void importFile(file, 'new')
  const importDraft = (file: File) => void importFile(file, 'editor')
  const importDropped = (files: FileList) => {
    if (files.length !== 1) {
      setNotice('请一次导入一个 .md 文件。')
      return
    }
    importDraft(files[0])
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
    refreshHeadings()
    if (window.location.hash) {
      try {
        const id = decodeURIComponent(window.location.hash.slice(1))
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView())
      } catch {
        /* A malformed fragment does not identify a heading. */
      }
    }
  }
  const authenticate = async (code: string) => {
    const response = await fetch('/api/session', { method: 'POST', headers: { Code: code } })
    const session = (await response.json()) as { expiresAt: number; message?: string }
    if (!response.ok) throw new Error(session.message || '验证失败，请重试')
    setSessionExpiresAt(session.expiresAt)
    setAuthenticated(true)
  }
  const submit = async (mode: 'save' | 'delete', code?: string) => {
    // The page is leaving once the check shows; a second submit would only repeat it.
    if (saved) return
    setWriting(true)
    try {
      if (code) await authenticate(code)
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
      if (deleting) {
        window.location.replace(postHref(1, true))
        return
      }
      // Hold the reload a beat: the button settles into its check instead of being
      // replaced mid-animation.
      setWriting(false)
      setSaved(true)
      await new Promise((resolve) => window.setTimeout(resolve, 800))
      window.location.replace(postHref(result.id, true))
    } finally {
      setWriting(false)
    }
  }
  const confirmSave = (code?: string) => submit(saveMode!, code)
  const requestSave = () => {
    if (!draft.createon) {
      setNotice('请选择文章日期')
      return
    }
    if (sessionExpiresAt > Date.now()) void submit('save').catch((error) => setNotice(error.message))
    else setSaveMode('save')
  }
  const requestDelete = () => setSaveMode('delete')
  const saveFromKeyboard = useEffectEvent(() => {
    if (!dirty || saveMode || writing) return
    requestSave()
  })
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey || (event.key !== 's' && event.key !== 'S')) return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      if (!event.repeat) saveFromKeyboard()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editing])
  // Nothing to apply: the library re-parses the buffer as source mode ends.
  const toggleSource = () => setSourceMode(editor.current?.toggleSource() ?? false)

  return {
    draft,
    updateDraft,
    readOnly,
    editing,
    setReadOnly,
    revision,
    bodyDirty,
    setBodyDirty,
    ready,
    writing,
    saved,
    editor,
    headings,
    notice,
    dismissNotice,
    saveMode,
    closeSaveDialog,
    sessionExpiresAt,
    authenticated,
    authenticate,
    sourceMode,
    toggleSource,
    confirmSave,
    requestSave,
    requestDelete,
    pending,
    cancelPending,
    confirmPending,
    guardNavigation,
    importPost,
    importDraft,
    importDropped,
    editorReady,
  }
}
