import { defineHandler, HTTPError } from 'nitro'
import { requireSession } from '../../utils/auth.ts'
import { getBindings } from '../../utils/env.ts'
import { deleteToken, revokeToken } from '../../utils/tokens.ts'

// PATCH revokes, and the row stays as a record; DELETE removes a row that is
// already revoked. Two steps on purpose: the inert row is the only trace left.
export default defineHandler(async (event) => {
  const id = Number(event.context.params?.id)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HTTPError({ status: 404, message: '令牌不存在' })
  const method = event.req.method
  if (method !== 'PATCH' && method !== 'DELETE') {
    return Response.json({ message: '不支持的请求方法' }, { status: 405, headers: { Allow: 'PATCH, DELETE' } })
  }
  const { DB, JWT_SECRET } = getBindings(event)
  await requireSession(event, JWT_SECRET)
  await (method === 'PATCH' ? revokeToken(DB, id) : deleteToken(DB, id))
  return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
})
