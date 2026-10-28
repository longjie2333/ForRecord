import { defineHandler } from 'nitro'
import { requireSession } from '../../utils/auth.ts'
import { getBindings } from '../../utils/env.ts'
import { json, readJson, requireMethod } from '../../utils/http.ts'
import { createPost, listPosts } from '../../utils/posts.ts'

export default defineHandler(async (event) => {
  const method = requireMethod(event, ['GET', 'POST'])
  const { DB, JWT_SECRET } = getBindings(event)
  if (method === 'GET') return json(await listPosts(DB))
  await requireSession(event, JWT_SECRET)
  const { id } = await createPost(DB, await readJson(event))
  return json({ success: true, id }, 201)
})
