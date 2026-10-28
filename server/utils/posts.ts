import { HTTPError } from 'nitro'
import type { Post, PostInput, PostSummary } from '../../shared/posts.ts'
import { normalizePath } from '../../shared/tree.ts'
import { noStore } from './http.ts'
import { ALWAYS, type Clause } from './scope.ts'

/**
 * The note rules every entry point shares — the web API and the MCP tools both write
 * through these, so README's protection and a title's form are decided in one place. A
 * `scope` narrows a statement to the rows a token may touch; the web session sees them all.
 */

// D1 caps a row at 2 MB; the body leaves room for the title and `comments` beside it.
export const MAX_CONTENT_BYTES = 1024 * 1024
const encoder = new TextEncoder()

const fail = (status: number, message: string): never => {
  throw new HTTPError({ status, message, headers: noStore })
}

// A write that matches nothing has already passed a read under the same scope, unless it
// came from the session, so a token's miss means the row left its boundary in between.
const missing = (id: number, scope: Clause) =>
  fail(404, scope === ALWAYS ? `笔记 #${id} 不存在` : `笔记 #${id} 已不存在或已不在当前令牌的授权范围内`)

export const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export const validatePost = (input: unknown): PostInput => {
  const post = (input ?? {}) as Partial<Record<keyof PostInput, unknown>>
  const title = typeof post.title === 'string' ? normalizePath(post.title) : ''
  if (title === null) fail(400, '标题不能包含 “..”')
  if (!title) fail(400, '请填写标题')
  if (typeof post.content !== 'string') fail(400, '正文必须为 Markdown 文本')
  if (encoder.encode(post.content as string).byteLength > MAX_CONTENT_BYTES) {
    fail(413, `正文不能超过 ${MAX_CONTENT_BYTES / 1024 / 1024} MB，图片请使用链接`)
  }
  if (!validDate(post.createon)) fail(400, '请填写有效日期')
  return { title: title!, content: post.content as string, createon: post.createon as string }
}

/**
 * One statement tells "missing" from "not yours": the scope is part of the join, so a row
 * the token may not see never leaves the database — only the fact that it exists does.
 */
export const readPost = async (db: D1Database, id: number, scope: Clause = ALWAYS): Promise<Post> => {
  const row = await db
    .prepare(
      `SELECT EXISTS(SELECT 1 FROM notes WHERE id=?) AS found, n.id, n.title, n.content, n.createon, n.comments
       FROM (SELECT 1) LEFT JOIN notes n ON n.id=? AND (${scope.sql})`,
    )
    .bind(id, id, ...scope.params)
    .first<{ found: number } & { [K in keyof Post]: Post[K] | null }>()
  if (!row?.found) return fail(404, `笔记 #${id} 不存在`)
  if (row.id === null) return fail(403, `笔记 #${id} 不在当前令牌的授权范围内`)
  return { id: row.id, title: row.title!, content: row.content!, createon: row.createon!, comments: row.comments }
}

export const listPosts = async (db: D1Database): Promise<PostSummary[]> => {
  const { results } = await db.prepare('SELECT id, title, createon FROM notes ORDER BY id DESC').all<PostSummary>()
  return results
}

export const createPost = async (db: D1Database, input: unknown) => {
  const { title, content, createon } = validatePost(input)
  const result = await db
    .prepare('INSERT INTO notes (title, content, createon) VALUES (?, ?, ?)')
    .bind(title, content, createon)
    .run()
  return { id: Number(result.meta.last_row_id), title }
}

/**
 * `comments` is not one of the written columns, so it survives every update. The scope is
 * repeated in the statement: a title renamed in between cannot move the row out of it.
 */
export const updatePost = async (db: D1Database, id: number, input: unknown, scope: Clause = ALWAYS) => {
  const { title, content, createon } = validatePost(input)
  if (id === 1 && title !== 'README') fail(400, '首页标题必须为 README')
  const result = await db
    .prepare(`UPDATE notes SET title=?, content=?, createon=? WHERE id=? AND (${scope.sql})`)
    .bind(title, content, createon, id, ...scope.params)
    .run()
  if (!result.meta.changes) missing(id, scope)
  return { id, title }
}

export const deletePost = async (db: D1Database, id: number, scope: Clause = ALWAYS) => {
  if (id === 1) fail(400, '首页 README 不能删除')
  const result = await db
    .prepare(`DELETE FROM notes WHERE id=? AND (${scope.sql})`)
    .bind(id, ...scope.params)
    .run()
  if (!result.meta.changes) missing(id, scope)
}
