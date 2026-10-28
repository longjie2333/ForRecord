import type { TreeSort } from './tree.ts'

export interface Post {
  id: number
  title: string
  content: string
  createon: string
  comments: string | null
}

export type PostSummary = Pick<Post, 'id' | 'title' | 'createon'>
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

/** A day the reader picked on a calendar, which hands it over as local midnight. */
export const calendarDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * The site's calendar day, the one every "today" means: the server runs in UTC and a
 * browser in its own zone, and either would put a note or an expiry on another day.
 */
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

export const sidebarWidth = { min: 220, max: 480, initial: 304 } as const

export const clampSidebarWidth = (width: number) => Math.min(sidebarWidth.max, Math.max(sidebarWidth.min, width))

export const sidebarPreferences = (value?: string) => {
  const match = /^(\d+):(0|1)$/.exec(value ?? '')
  return { width: match ? clampSidebarWidth(Number(match[1])) : sidebarWidth.initial, collapsed: match?.[2] === '1' }
}

/** The sort cookie is `folders:key:order`, as `serializeSort` writes it. */
export const sidebarSort = (value?: string): TreeSort => {
  const match = /^(0|1):(title|created):(asc|desc)$/.exec(value ?? '')
  return match
    ? { folders: match[1] === '1', key: match[2] as TreeSort['key'], order: match[3] as TreeSort['order'] }
    : { folders: true, key: 'created', order: 'desc' }
}

export const serializeSort = ({ folders, key, order }: TreeSort) => `${folders ? 1 : 0}:${key}:${order}`

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
