import type { PostSummary } from './posts.ts'

export interface TreeNode {
  name: string
  path: string
  id?: number
  children: TreeNode[]
}

/** `folders` lifts directories above notes at every level, independently of the key. */
export interface TreeSort {
  folders: boolean
  key: 'title' | 'created'
  order: 'asc' | 'desc'
}

// A fixed locale, so the server and the browser order the sidebar alike and hydration holds.
const collator = new Intl.Collator('zh-CN', { numeric: true })

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * A title is the note's path, so every entry point stores it in one form: `a//b/./c` is
 * `a/b/c`, and a `..` segment is not a title.
 */
export const normalizePath = (value: string): string | null => {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.')
  return parts.includes('..') ? null : parts.join('/')
}

export const normalizePaths = (values: readonly string[]): string[] | null => {
  const paths: string[] = []
  for (const value of values) {
    const path = normalizePath(value)
    if (path === null) return null
    if (path) paths.push(path)
  }
  return [...new Set(paths)]
}

/**
 * Notes are placed in creation order before the tree is built, so under `created` a folder
 * sits where its first note in that order does. `title` then orders each level by name.
 */
const arrange = (nodes: TreeNode[], sort: TreeSort): TreeNode[] => {
  const sign = sort.order === 'asc' ? 1 : -1
  const level = nodes.map((node) => ({ ...node, children: arrange(node.children, sort) }))
  const named = sort.key === 'title' ? level.toSorted((a, b) => sign * collator.compare(a.name, b.name)) : level
  return sort.folders
    ? [...named.filter((node) => node.id === undefined), ...named.filter((node) => node.id !== undefined)]
    : named
}

export const buildTree = (posts: PostSummary[], sort: TreeSort): TreeNode[] => {
  const sign = sort.order === 'asc' ? 1 : -1
  const ordered = posts.toSorted((a, b) => sign * (compareText(a.createon, b.createon) || a.id - b.id))
  const root: TreeNode[] = []
  for (const post of ordered) {
    const parts = post.title.split('/')
    let children = root
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join('/')
      if (index === parts.length - 1) {
        children.push({ name, path, id: post.id, children: [] })
      } else {
        let folder = children.find((node) => node.id === undefined && node.name === name)
        if (!folder) {
          folder = { name, path, children: [] }
          children.push(folder)
        }
        children = folder.children
      }
    })
  }
  return arrange(root, sort)
}
