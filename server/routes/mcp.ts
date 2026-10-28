import { defineHandler } from 'nitro'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { getBindings } from '../utils/env.ts'
import { noStore } from '../utils/http.ts'
import { createMcpServer } from '../utils/mcp.ts'
import { authenticateToken, touchToken } from '../utils/tokens.ts'

// Stateless: no session, no cookie, so the digest lookup in D1 is the whole authentication
// step. CORS is the `/mcp` route rule in nitro.config.ts, which also answers a preflight —
// it cannot carry the header it asks about, so it never reaches this handler. Origin and
// Host are not checked: a browser sends no credential of its own here, so an Origin check
// would protect nothing while locking out every browser client, and DNS-rebinding
// protection is for a service running on the visitor's own machine.
const unauthorized = () =>
  Response.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: '缺少或无效的访问令牌：请在站点的「访问令牌」中签发一个，并以 Authorization: Bearer 发送。',
      },
    },
    {
      status: 401,
      headers: { ...noStore, 'WWW-Authenticate': 'Bearer realm="for-record", error="invalid_token"' },
    },
  )

export default defineHandler(async (event) => {
  const { DB } = getBindings(event)
  const scope = await authenticateToken(DB, event.req.headers.get('Authorization'))
  if (!scope) return unauthorized()
  event.waitUntil(touchToken(DB, scope.id).catch((error: unknown) => console.error(error)))
  // The scope is a parameter of the server, so the handler is built for this request.
  // `event.req` is the runtime's Request; only the Workers typings disagree on its shape.
  return createMcpHandler(() => createMcpServer(DB, scope), { onerror: (error) => console.error(error) }).fetch(
    event.req as unknown as Request,
  )
})
