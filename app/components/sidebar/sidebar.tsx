import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { ChevronRightIcon, FileTextIcon, FolderIcon, HouseIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../ui/collapsible.tsx'
import { Input } from '../ui/input.tsx'
import { Button } from '../ui/button.tsx'
import { buildTree, type TreeNode } from '../../../shared/tree.ts'
import { postHref, type PostSummary } from '../../../shared/posts.ts'

export interface SidebarProps {
  posts: PostSummary[]
  selected?: number
  editing: boolean
  isNew: boolean
  onImport: (file: File) => void
}

export const Sidebar = ({
  posts,
  selected,
  editing,
  isNew,
  onImport,
  collapseControl,
}: SidebarProps & { collapseControl: ReactNode }) => {
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const tree = useMemo(
    () =>
      buildTree(
        posts.filter((post) => post.id !== 1 && post.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
      ),
    [posts, search],
  )
  const activeTitle = posts.find((post) => post.id === selected)?.title ?? ''

  const renderTree = (nodes: TreeNode[]) =>
    nodes.map((node) =>
      node.id !== undefined ? (
        <a
          key={`post-${node.id}`}
          className="tree-item"
          href={postHref(node.id, editing)}
          aria-current={node.id === selected ? 'page' : undefined}
          title={node.path}
        >
          <FileTextIcon aria-hidden="true" />
          <span>{node.name || '未命名'}</span>
        </a>
      ) : (
        <Collapsible
          key={`folder-${node.path}-${!!search}`}
          defaultOpen={!!search || activeTitle.startsWith(`${node.path}/`)}
        >
          <CollapsibleTrigger type="button" className="tree-item folder-item">
            <ChevronRightIcon className="folder-chevron" aria-hidden="true" />
            <FolderIcon aria-hidden="true" />
            <span>{node.name || '/'}</span>
          </CollapsibleTrigger>
          <CollapsiblePanel keepMounted>
            <div className="tree-children">{renderTree(node.children)}</div>
          </CollapsiblePanel>
        </Collapsible>
      ),
    )

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length !== 1) return
    onImport(event.dataTransfer.files[0])
  }

  return (
    <>
      <div className="sidebar-controls flex items-center gap-1.5 px-3.5 pb-3.5 pt-[18px] [&>button]:shrink-0 [&>button]:text-muted-foreground">
        <div className="sidebar-search relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 z-1 size-[15px] -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="搜索文章"
            placeholder="搜索笔记…"
            value={search}
            className="[&_input]:bg-background [&_input]:pl-8 [&_input]:text-[13px] max-md:[&_input]:text-base"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {collapseControl}
      </div>
      <nav className="post-tree min-h-0 flex-1 overflow-auto px-3.5 pb-5" aria-label="文章目录">
        <a
          className="tree-item home-item"
          href={postHref(1, editing)}
          aria-current={selected === 1 ? 'page' : undefined}
        >
          <HouseIcon aria-hidden="true" />
          <span>首页</span>
        </a>
        <div className="mx-[7px] mb-1.5 mt-[18px] flex items-center gap-2 text-[11px] text-muted-foreground">笔记</div>
        {renderTree(tree)}
        {tree.length === 0 && (
          <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">
            {search ? '没有找到匹配的笔记' : '还没有笔记'}
          </p>
        )}
      </nav>
      <div className="sidebar-footer-slot shrink-0" data-state={editing ? 'open' : 'closed'} inert={!editing}>
        <div className="sidebar-footer px-3.5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            render={<a href="/post/new/edit" />}
            variant="ghost"
            className={`tree-item new-post ${dragging ? 'is-dragging' : ''}`}
            aria-current={isNew ? 'page' : undefined}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <PlusIcon aria-hidden="true" />
            <span>{dragging ? '松开以导入 .md 文件' : '新增文章'}</span>
          </Button>
        </div>
      </div>
    </>
  )
}
