import { HTTPError } from 'nitro'
import type { Post, PostInput, PostSummary } from '../../shared/posts.ts'

export const readPost = async (db: D1Database, id: number): Promise<Post> => {
  const post = await db.prepare('SELECT * FROM notes WHERE id=?').bind(id).first<Post>()
  if (!post) throw new HTTPError({ status: 404, message: '文章不存在' })
  return post
}

export const listPosts = async (db: D1Database): Promise<PostSummary[]> => {
  const { results } = await db.prepare('SELECT id, title FROM notes ORDER BY id DESC').all<PostSummary>()
  return results
}

export const validatePost = (input: unknown): PostInput => {
  const post = input as Partial<PostInput> | null
  if (
    !post ||
    typeof post.title !== 'string' ||
    !post.title.trim() ||
    typeof post.content !== 'string' ||
    typeof post.createon !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(post.createon) ||
    !Number.isFinite(Date.parse(post.createon)) ||
    new Date(post.createon).toISOString().slice(0, 10) !== post.createon
  ) {
    throw new HTTPError({ status: 400, message: '请填写标题和有效日期，正文必须为 Markdown 文本' })
  }
  return { title: post.title, content: post.content, createon: post.createon }
}
