import type { PostSummary } from './posts.ts'

export interface TreeNode {
  name: string
  path: string
  id?: number
  children: TreeNode[]
}

/** `recent` keeps the incoming order, which is newest first. */
export type TreeSort = 'folders' | 'recent'

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

const foldersFirst = (nodes: TreeNode[]): TreeNode[] => [
  ...nodes.filter((node) => node.id === undefined).map((node) => ({ ...node, children: foldersFirst(node.children) })),
  ...nodes.filter((node) => node.id !== undefined),
]

export const buildTree = (posts: PostSummary[], sort: TreeSort = 'folders'): TreeNode[] => {
  const root: TreeNode[] = []
  for (const post of posts) {
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
  return sort === 'folders' ? foldersFirst(root) : root
}
