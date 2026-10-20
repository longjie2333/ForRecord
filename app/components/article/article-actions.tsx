import { useRef } from 'react'
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
}: {
  sidebar: SidebarProps
  error?: string
  collapsed: boolean
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onExpandSidebar: () => void
  onEditSource: () => void
  onImportDraft: (file: File) => void
}) => {
  const { selected, editing, isNew } = sidebar
  const fileInput = useRef<HTMLInputElement>(null)
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
          <Button variant="ghost" size="icon" render={<a href={postHref(selected ?? 1)} />}>
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
            <Button variant="ghost" size="icon" render={<a href={postHref(selected ?? 1, true)} />}>
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
