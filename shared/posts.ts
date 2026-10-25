import type { TreeSort } from './tree.ts'

export interface Post {
  id: number
  title: string
  content: string
  createon: string
  comments: string | null
}

export type PostSummary = Pick<Post, 'id' | 'title'>
export type PostInput = Pick<Post, 'title' | 'content' | 'createon'>

export interface Site {
  title: string
  icon: string
  author: string
  keywords: string
  description: string
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface PageData {
  site: Site
  post: Post | null
  posts: PostSummary[]
  readOnly: boolean
  isNew: boolean
  sidebar: { width: number; collapsed: boolean; sort: TreeSort }
  theme: ThemeMode
  sessionExpiresAt: number
  error?: string
}

export interface Heading {
  id: string
  text: string
  level: number
}

export const postHref = (id: number, editing = false) => (editing ? `/post/${id}/edit` : id === 1 ? '/' : `/post/${id}`)

export const today = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** The reader's calendar day on a server that runs in UTC, where `today()` would lag by a day. */
export const siteToday = (date = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date)

export const createHeadingId = () => {
  const used = new Set(['app', 'page-data', 'content'])
  return (text: string) => {
    const title = text.trim() || 'section'
    let id = title
    for (let suffix = 2; used.has(id); suffix++) id = `${title}-${suffix}`
    used.add(id)
    return id
  }
}

export const plainHeading = (text: string) =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')

export const headingText = (element: Element) => plainHeading(element.textContent ?? '')

export const sidebarPreferences = (value?: string) => {
  const match = /^(\d+):(0|1)$/.exec(value ?? '')
  return { width: match ? Math.max(220, Math.min(480, Number(match[1]))) : 304, collapsed: match?.[2] === '1' }
}

export const sidebarSort = (value?: string): TreeSort => (value === 'recent' ? 'recent' : 'folders')

export const themeMode = (value?: string): ThemeMode => (value === 'light' || value === 'dark' ? value : 'system')

export const parsePagePath = (pathname: string) => {
  if (pathname === '/') return { id: 1, readOnly: true, raw: false, isNew: false }
  if (pathname === '/post/new/edit') return { id: null, readOnly: false, raw: false, isNew: true }
  const match = /^\/post\/([1-9]\d*)(\.md)?(\/edit)?$/.exec(pathname)
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null
  return { id: Number(match[1]), raw: !!match[2], readOnly: !match[3], isNew: false }
}

export const acceptsMarkdown = (accept: string | null) => {
  const types = (accept || '').split(',').map((part) => {
    const [type, ...parameters] = part.trim().toLowerCase().split(';')
    const quality = parameters.find((value) => value.trim().startsWith('q='))
    return { type, q: quality ? Number(quality.trim().slice(2)) : 1 }
  })
  const markdown = types.find(({ type }) => type === 'text/markdown')
  const html = types.find(({ type }) => type === 'text/html')
  return !!markdown && markdown.q > 0 && markdown.q >= (html?.q || 0)
}
