import { useRef, type MouseEvent } from 'react'
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  FileCodeIcon,
  PencilLineIcon,
  PanelLeftOpenIcon,
  UploadIcon,
} from 'lucide-react'
import { Button } from '../ui/button.tsx'
import { MobileSidebar } from '../sidebar/mobile-sidebar.tsx'
import type { SidebarProps } from '../sidebar/sidebar.tsx'
import { postHref } from '../../../shared/posts.ts'

export const ArticleActions = ({
  sidebar,
  error,
  collapsed,
  mobileOpen,
  onMobileOpenChange,
  onExpandSidebar,
  onEditSource,
  onImportDraft,
  onModeChange,
}: {
  sidebar: SidebarProps
  error?: string
  collapsed: boolean
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onExpandSidebar: () => void
  onEditSource: () => void
  onImportDraft: (file: File) => void
  onModeChange: (readOnly: boolean) => void
}) => {
  const { selected, editing, isNew } = sidebar
  const fileInput = useRef<HTMLInputElement>(null)
  // Both modes live in the same document, so a plain click switches in place. The
  // hrefs stay real: a modified click opens the other mode as its own page, and an
  // unsaved draft is caught by the page's navigation guard before this runs.
  const switchMode = (readOnly: boolean) => (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onModeChange(readOnly)
  }
  return (
    <div
      className="floating-actions floating-surface floating-rounded"
      data-mode={editing ? 'edit' : 'read'}
      role="group"
      aria-label="文章操作"
    >
      {collapsed && (
        <Button
          className="desktop-sidebar-toggle"
          variant="ghost"
          size="icon"
          aria-label="展开侧边栏"
          onClick={onExpandSidebar}
        >
          <PanelLeftOpenIcon aria-hidden="true" />
        </Button>
      )}
      <MobileSidebar {...sidebar} open={mobileOpen} onOpenChange={onMobileOpenChange} />
      {editing ? (
        <>
          <Button variant="ghost" size="icon" aria-label="编辑源码" title="编辑源码" onClick={onEditSource}>
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
          <Button
            variant="ghost"
            size="icon"
            render={<a href={postHref(selected ?? 1)} />}
            aria-label="阅读"
            title="阅读"
            onClick={isNew ? undefined : switchMode(true)}
          >
            <BookOpenIcon aria-hidden="true" />
          </Button>
        </>
      ) : (
        !error && (
          <>
            <Button
              variant="ghost"
              size="icon"
              render={<a href={`/post/${selected}.md`} />}
              aria-label="查看 Markdown 源文"
              title="查看 Markdown 源文"
            >
              <ArrowUpRightIcon aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              render={<a href={postHref(selected ?? 1, true)} />}
              aria-label="编辑"
              title="编辑"
              onClick={switchMode(false)}
            >
              <PencilLineIcon aria-hidden="true" />
            </Button>
          </>
        )
      )}
      <input
        type="file"
        accept=".md"
        hidden
        ref={fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onImportDraft(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
