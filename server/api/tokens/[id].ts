import { defineHandler } from 'nitro'
import { requireSession } from '../../utils/auth.ts'
import { getBindings } from '../../utils/env.ts'
import { json, requireMethod, routeId } from '../../utils/http.ts'
import { deleteToken, revokeToken } from '../../utils/tokens.ts'

// PATCH revokes and keeps the row as a record; DELETE removes a row that is already
// revoked. Two steps on purpose: the inert row is the only trace left.
export default defineHandler(async (event) => {
  const id = routeId(event, '令牌不存在')
  const method = requireMethod(event, ['PATCH', 'DELETE'])
  const { DB, JWT_SECRET } = getBindings(event)
  await requireSession(event, JWT_SECRET)
  await (method === 'PATCH' ? revokeToken(DB, id) : deleteToken(DB, id))
  return json({ success: true })
})
