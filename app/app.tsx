import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { DesktopSidebar } from './components/sidebar/desktop-sidebar.tsx'
import { SidebarResizer } from './components/sidebar/sidebar-resizer.tsx'
import { ArticleActions } from './components/article/article-actions.tsx'
import { ArticleView } from './components/article/article-view.tsx'
import { ArticleInfo } from './components/article/article-info.tsx'
import { DiscardDialog } from './components/article/discard-dialog.tsx'
import { ProximityNavigation } from './components/article/proximity-navigation.tsx'
import { SaveDialog } from './components/article/save-dialog.tsx'
import { useArticle } from './lib/use-article.ts'
import { useTheme } from './lib/theme.ts'
import type { PageData } from '../shared/posts.ts'
import type { TreeSort } from '../shared/tree.ts'

export const App = ({ data, bodyHtml }: { data: PageData; bodyHtml?: string }) => {
  const { post, isNew, site } = data
  const article = useArticle({
    post,
    isNew,
    readOnly: data.readOnly,
    sessionExpiresAt: data.sessionExpiresAt,
  })
  const { editing, readOnly } = article
  const [theme, cycleTheme] = useTheme(data.theme)
  const [sidebarWidth, setSidebarWidth] = useState(data.sidebar.width)
  const [collapsed, setCollapsed] = useState(data.sidebar.collapsed)
  const [sort, setSort] = useState(data.sidebar.sort)
  const [resizing, setResizing] = useState(false)
  const layout = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = layout.current
    if (!element) return
    let timer = 0
    const onResize = () => {
      element.classList.add('viewport-resizing')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => element.classList.remove('viewport-resizing'), 160)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(timer)
    }
  }, [])
  const saveSidebar = (width: number, closed: boolean) => {
    setSidebarWidth(width)
    setCollapsed(closed)
    document.cookie = `for-record-sidebar=${width}:${closed ? 1 : 0}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  const saveSort = (next: TreeSort) => {
    setSort(next)
    document.cookie = `for-record-sort=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  const sidebar = {
    posts: data.posts,
    selected: post?.id,
    editing,
    isNew,
    sort,
    onSortChange: saveSort,
    onImport: article.importPost,
  }

  return (
    <div
      ref={layout}
      className={`blog-layout ${collapsed ? 'sidebar-collapsed' : ''} ${resizing ? 'resizing' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      onClickCapture={article.guardNavigation}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
    >
      <a className="fixed top-[-100px] left-2.5 z-100 bg-background p-2.5 focus:top-2.5" href="#content">
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
          onExpandSidebar={() => saveSidebar(sidebarWidth, false)}
          sourceMode={article.sourceMode}
          onToggleSource={article.toggleSource}
          onImportDraft={article.importDraft}
          onModeChange={article.setReadOnly}
          theme={theme}
          onCycleTheme={cycleTheme}
          authenticated={article.authenticated}
          onAuthenticate={article.authenticate}
        />
        <ArticleView
          error={data.error}
          author={site.author}
          date={article.draft.createon}
          notice={article.notice}
          onDismissNotice={article.dismissNotice}
          revision={article.revision}
          content={article.draft.content}
          html={bodyHtml}
          readOnly={readOnly}
          sourceMode={article.sourceMode}
          isNew={isNew}
          writing={article.writing}
          bodyDirty={article.bodyDirty}
          editorRef={article.editor}
          onEditorReady={article.editorReady}
          onEditorDirty={article.setBodyDirty}
          onToggleSource={article.toggleSource}
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
          saved={article.saved}
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
      <DiscardDialog
        open={article.pending !== null}
        onCancel={article.cancelPending}
        onConfirm={article.confirmPending}
      />
    </div>
  )
}
