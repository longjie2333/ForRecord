import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  FileTextIcon,
  FilePenLineIcon,
  FileSearchIcon,
  FolderIcon,
  FolderOpenIcon,
  HouseIcon,
  PlusIcon,
  SearchIcon,
  DoorStairwellIcon,
} from 'lucide-react'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../ui/collapsible.tsx'
import { IconSwap } from '../motion/icon-swap.tsx'
import { shakeAnimation, useShakeOnHover } from '../motion/shake-icon.tsx'
import { Input } from '../ui/input.tsx'
import { Button } from '../ui/button.tsx'
import { buildTree, type TreeNode } from '../../../shared/tree.ts'
import { postHref, type PostSummary } from '../../../shared/posts.ts'

// Motion wraps one component per icon, so build the shaking plus once.
const MotionPlusIcon = motion.create(PlusIcon)

export interface SidebarProps {
  posts: PostSummary[]
  selected?: number
  editing: boolean
  isNew: boolean
  onImport: (file: File) => void
}

const HomeA = ({ editing, selected }: { editing: boolean; selected: number | undefined }) => {
  const { shaking, shakeProps } = useShakeOnHover()
  return (
    <a
      className="tree-item home-item"
      href={postHref(1, editing)}
      aria-current={selected === 1 ? 'page' : undefined}
      {...shakeProps}
    >
      <IconSwap
        active={shaking}
        onIcon={<DoorStairwellIcon aria-hidden="true" />}
        offIcon={<HouseIcon aria-hidden="true" />}
      />
      <span>首页</span>
    </a>
  )
}

// A folder owns its open state so the icon can follow the panel: the panel keeps
// its height animation, the icon swaps between the closed and open folder.
const FolderRow = ({ name, defaultOpen, children }: { name: string; defaultOpen: boolean; children: ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger type="button" className="tree-item">
        <IconSwap className="size-4" active={open} onIcon={<FolderOpenIcon />} offIcon={<FolderIcon />} />
        <span>{name || '/'}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted>
        <div className="tree-children">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  )
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
  const { shaking, shakeProps } = useShakeOnHover()
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
          {node.id === selected ? (
            <IconSwap
              active={editing}
              onIcon={<FilePenLineIcon aria-hidden="true" />}
              offIcon={<FileSearchIcon aria-hidden="true" />}
            />
          ) : (
            <FileTextIcon aria-hidden="true" />
          )}
          <span>{node.name || '未命名'}</span>
        </a>
      ) : (
        <FolderRow
          key={`folder-${node.path}-${!!search}`}
          name={node.name}
          defaultOpen={!!search || activeTitle.startsWith(`${node.path}/`)}
        >
          {renderTree(node.children)}
        </FolderRow>
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
        <HomeA editing={editing} selected={selected} />
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
            {...shakeProps}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <MotionPlusIcon aria-hidden="true" {...shakeAnimation(shaking)} />
            <span>{dragging ? '松开以导入 .md 文件' : '新增文章'}</span>
          </Button>
        </div>
      </div>
    </>
  )
}
