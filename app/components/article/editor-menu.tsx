import { Fragment } from 'react'
import {
  BoldIcon,
  CodeIcon,
  FileCodeIcon,
  FunctionSquareIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  Redo2Icon,
  SigmaIcon,
  TableIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react'
import {
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
} from '../ui/context-menu.tsx'
import type { EditorCommand } from '../../lib/milkdown.ts'

export type EditorMenuItem = EditorCommand | 'source'

export interface EditorMenuAction {
  id: EditorMenuItem
  label: string
  icon: LucideIcon
}

export interface EditorMenuGroup {
  label: string
  /** Rendered as a submenu in the right-click menu; the slash menu always stays flat. */
  nested?: boolean
  items: EditorMenuAction[]
}

// One list drives both entry points: right click on the article and a slash typed
// at the start of a block.
export const editorMenuGroups: EditorMenuGroup[] = [
  {
    label: '格式',
    items: [
      { id: 'bold', label: '加粗', icon: BoldIcon },
      { id: 'italic', label: '斜体', icon: ItalicIcon },
    ],
  },
  {
    label: '段落',
    nested: true,
    items: [
      { id: 'paragraph', label: '正文', icon: PilcrowIcon },
      { id: 'h1', label: '一级标题', icon: Heading1Icon },
      { id: 'h2', label: '二级标题', icon: Heading2Icon },
      { id: 'h3', label: '三级标题', icon: Heading3Icon },
      { id: 'quote', label: '引用', icon: QuoteIcon },
    ],
  },
  {
    label: '列表',
    nested: true,
    items: [
      { id: 'bulletList', label: '无序列表', icon: ListIcon },
      { id: 'orderedList', label: '有序列表', icon: ListOrderedIcon },
      { id: 'taskList', label: '任务列表', icon: ListTodoIcon },
    ],
  },
  {
    label: '插入',
    nested: true,
    items: [
      { id: 'code', label: '代码块', icon: CodeIcon },
      { id: 'table', label: '表格', icon: TableIcon },
      { id: 'image', label: '图片', icon: ImageIcon },
      { id: 'link', label: '链接', icon: LinkIcon },
      { id: 'mathInline', label: '行内公式', icon: SigmaIcon },
      { id: 'mathBlock', label: '公式块', icon: FunctionSquareIcon },
      { id: 'divider', label: '分隔线', icon: MinusIcon },
    ],
  },
  {
    label: '操作',
    items: [
      { id: 'undo', label: '撤销', icon: Undo2Icon },
      { id: 'redo', label: '重做', icon: Redo2Icon },
      { id: 'source', label: '源码', icon: FileCodeIcon },
    ],
  },
]

export const filterEditorMenu = (query: string): EditorMenuGroup[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return editorMenuGroups
  return editorMenuGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(needle)) }))
    .filter((group) => group.items.length > 0)
}

export const EditorMenu = ({
  groups,
  activeId,
  disabled,
  nested,
  onSelect,
}: {
  groups: EditorMenuGroup[]
  activeId?: string | null
  disabled?: boolean
  nested?: boolean
  onSelect: (id: EditorMenuItem) => void
}) => {
  if (!groups.length) {
    return <p className="px-2 py-1.5 text-muted-foreground text-xs">没有匹配的命令</p>
  }
  const renderItem = ({ id, label, icon: Icon }: EditorMenuAction) => (
    <ContextMenuItem
      className={id === activeId ? 'bg-accent text-accent-foreground' : undefined}
      disabled={disabled}
      key={id}
      onClick={() => onSelect(id)}
    >
      <Icon aria-hidden="true" />
      {label}
    </ContextMenuItem>
  )
  return groups.map((group, index) => (
    <Fragment key={group.label}>
      {index > 0 && <ContextMenuSeparator />}
      {nested && group.nested ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>{group.label}</ContextMenuSubTrigger>
          <ContextMenuSubPopup>{group.items.map(renderItem)}</ContextMenuSubPopup>
        </ContextMenuSub>
      ) : (
        <ContextMenuGroup>
          <ContextMenuGroupLabel>{group.label}</ContextMenuGroupLabel>
          {group.items.map(renderItem)}
        </ContextMenuGroup>
      )}
    </Fragment>
  ))
}
