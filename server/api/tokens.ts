import { defineHandler, HTTPError } from 'nitro'
import { requireSession } from '../utils/auth.ts'
import { getBindings } from '../utils/env.ts'
import { createToken, listTokens } from '../utils/tokens.ts'

// Token management is web-only: an MCP tool can never mint or inspect a token.
export default defineHandler(async (event) => {
  const request = event.req
  const method = request.method === 'HEAD' ? 'GET' : request.method
  if (method !== 'GET' && method !== 'POST') {
    return Response.json({ message: '不支持的请求方法' }, { status: 405, headers: { Allow: 'GET, HEAD, POST' } })
  }
  const { DB, JWT_SECRET } = getBindings(event)
  await requireSession(event, JWT_SECRET)
  const headers = { 'Cache-Control': 'no-store' }
  if (method === 'GET') return Response.json(await listTokens(DB), { headers })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HTTPError({ status: 400, message: '请求正文必须为 JSON' })
  }
  return Response.json(await createToken(DB, body), { status: 201, headers })
})
