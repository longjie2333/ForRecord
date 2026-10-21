import { useState, type CSSProperties } from 'react'
import { DesktopSidebar } from './components/sidebar/desktop-sidebar.tsx'
import { SidebarResizer } from './components/sidebar/sidebar-resizer.tsx'
import { ArticleActions } from './components/article/article-actions.tsx'
import { ArticleView } from './components/article/article-view.tsx'
import { ArticleInfo } from './components/article/article-info.tsx'
import { DiscardDialog } from './components/article/discard-dialog.tsx'
import { ProximityNavigation } from './components/article/proximity-navigation.tsx'
import { SaveDialog } from './components/article/save-dialog.tsx'
import { SourceDialog } from './components/article/source-dialog.tsx'
import { useArticle } from './lib/use-article.ts'
import type { PageData } from '../shared/posts.ts'

export const App = ({ data }: { data: PageData }) => {
  const { post, isNew, site } = data
  const article = useArticle({
    post,
    isNew,
    readOnly: data.readOnly,
    sessionExpiresAt: data.sessionExpiresAt,
  })
  const { editing, readOnly } = article
  const [sidebarWidth, setSidebarWidth] = useState(data.sidebar.width)
  const [collapsed, setCollapsed] = useState(data.sidebar.collapsed)
  const [resizing, setResizing] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Sidebar preferences persist in a cookie so every page opens with the same layout.
  const saveSidebar = (width: number, closed: boolean) => {
    setSidebarWidth(width)
    setCollapsed(closed)
    document.cookie = `for-record-sidebar=${width}:${closed ? 1 : 0}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  const sidebar = {
    posts: data.posts,
    selected: post?.id,
    editing,
    isNew,
    onImport: article.importPost,
  }

  return (
    <div
      className={`blog-layout ${collapsed ? 'sidebar-collapsed' : ''} ${editing ? 'editing-layout' : ''} ${resizing ? 'resizing' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      onClickCapture={article.guardNavigation}
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
      <DesktopSidebar {...sidebar} collapsed={collapsed} onCollapse={() => saveSidebar(sidebarWidth, true)} />
      {!collapsed && (
        <SidebarResizer
          width={sidebarWidth}
          resizing={resizing}
          onPreview={setSidebarWidth}
          onResizingChange={setResizing}
          onCommit={(width) => saveSidebar(width, false)}
        />
      )}
      <div className="content-column">
        <ArticleActions
          key={editing ? 'edit' : 'read'}
          sidebar={sidebar}
          error={data.error}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          onExpandSidebar={() => saveSidebar(sidebarWidth, false)}
          onEditSource={article.openSource}
          onImportDraft={article.importDraft}
          onModeChange={article.setReadOnly}
        />
        <ArticleView
          error={data.error}
          author={site.author}
          date={article.draft.createon}
          notice={article.notice}
          onDismissNotice={article.dismissNotice}
          revision={article.revision}
          content={article.draft.content}
          readOnly={readOnly}
          isNew={isNew}
          writing={article.writing}
          bodyDirty={article.bodyDirty}
          editorRef={article.editor}
          onEditorReady={article.editorReady}
          onEditorDirty={article.setBodyDirty}
          onEditSource={article.openSource}
          onDropFiles={article.importDropped}
        />
        {!editing && !data.error && <ProximityNavigation headings={article.headings} />}
        <ArticleInfo
          state={editing ? 'open' : 'closed'}
          title={article.draft.title}
          date={article.draft.createon}
          locked={post?.id === 1}
          deletable={!isNew && post?.id !== 1}
          ready={article.ready}
          writing={article.writing}
          onChangeTitle={(title) => article.updateDraft({ title })}
          onChangeDate={(createon) => article.updateDraft({ createon })}
          onSave={article.requestSave}
          onDelete={article.requestDelete}
        />
      </div>
      <SaveDialog
        mode={article.saveMode}
        authenticated={article.authenticated}
        onClose={article.closeSaveDialog}
        onSubmit={article.confirmSave}
      />
      <SourceDialog value={article.source} onClose={article.closeSource} onApply={article.applySource} />
      <DiscardDialog
        open={article.pending !== null}
        onCancel={article.cancelPending}
        onConfirm={article.confirmPending}
      />
    </div>
  )
}
