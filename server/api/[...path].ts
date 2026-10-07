import { defineHandler, HTTPError } from 'nitro'
import { getBindings } from '../utils/env.ts'
import { listPosts, readPost, validatePost } from '../utils/posts.ts'
import { requireSession } from '../utils/auth.ts'

export default defineHandler(async (event) => {
  const request = event.req
  const match = /^\/api\/posts(?:\/([1-9]\d*))?$/.exec(event.url.pathname)
  if (!match || (match[1] && !Number.isSafeInteger(Number(match[1])))) {
    throw new HTTPError({ status: 404, message: '接口不存在' })
  }
  const id = match[1] ? Number(match[1]) : null
  const { DB, JWT_SECRET } = getBindings(event)
  const headers = { 'Cache-Control': 'no-store' }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return Response.json(id ? await readPost(DB, id) : await listPosts(DB), { headers })
  }
  const allowed = id ? ['PATCH', 'DELETE'] : ['POST']
  if (!allowed.includes(request.method)) {
    return Response.json(
      { message: '不支持的请求方法' },
      {
        status: 405,
        headers: { ...headers, Allow: ['GET', 'HEAD', ...allowed].join(', ') },
      },
    )
  }
  await requireSession(event, JWT_SECRET)
  if (request.method === 'DELETE') {
    if (id === 1) throw new HTTPError({ status: 400, message: '首页 README 不能删除' })
    await readPost(DB, id!)
    await DB.prepare('DELETE FROM notes WHERE id=?').bind(id).run()
    return Response.json({ success: true }, { headers })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HTTPError({ status: 400, message: '请求正文必须为 JSON' })
  }
  const { title, content, createon } = validatePost(body)
  if (id) {
    await readPost(DB, id)
    if (id === 1 && title !== 'README') {
      throw new HTTPError({ status: 400, message: '首页标题必须为 README' })
    }
    await DB.prepare('UPDATE notes SET title=?, content=?, createon=? WHERE id=?')
      .bind(title, content, createon, id)
      .run()
    return Response.json({ success: true, id }, { headers })
  }
  const result = await DB.prepare('INSERT INTO notes (title, content, createon) VALUES (?, ?, ?)')
    .bind(title, content, createon)
    .run()
  return Response.json({ success: true, id: result.meta.last_row_id }, { status: 201, headers })
})
