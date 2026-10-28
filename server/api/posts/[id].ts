import { defineHandler } from 'nitro'
import { requireSession } from '../../utils/auth.ts'
import { getBindings } from '../../utils/env.ts'
import { json, readJson, requireMethod, routeId } from '../../utils/http.ts'
import { deletePost, readPost, updatePost } from '../../utils/posts.ts'

export default defineHandler(async (event) => {
  const id = routeId(event, '笔记不存在')
  const method = requireMethod(event, ['GET', 'PATCH', 'DELETE'])
  const { DB, JWT_SECRET } = getBindings(event)
  if (method === 'GET') return json(await readPost(DB, id))
  await requireSession(event, JWT_SECRET)
  if (method === 'DELETE') {
    await deletePost(DB, id)
    return json({ success: true })
  }
  await updatePost(DB, id, await readJson(event))
  return json({ success: true, id })
})
