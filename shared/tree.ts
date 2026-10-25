import type { PostSummary } from './posts.ts'

export interface TreeNode {
  name: string
  path: string
  id?: number
  children: TreeNode[]
}

/** `recent` keeps the incoming order, which is newest first. */
export type TreeSort = 'folders' | 'recent'

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
