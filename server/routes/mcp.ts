import { defineHandler } from 'nitro'
import { createMcpHandler } from 'agents/mcp/server'
import { getBindings } from '../utils/env.ts'
import { createMcpServer } from '../utils/mcp.ts'
import { authenticateToken, touchToken } from '../utils/tokens.ts'

// Stateless: no session, no cookie, so the digest lookup in D1 is the whole authentication
// step. Neither allowlist is passed: a browser sends no credential of its own here, so an
// Origin check would protect nothing while locking out every browser client, and
// DNS-rebinding protection is for a service running on the visitor's own machine.
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
      headers: { 'WWW-Authenticate': 'Bearer realm="for-record", error="invalid_token"', 'Cache-Control': 'no-store' },
    },
  )

export default defineHandler(async (event) => {
  const { DB } = getBindings(event)
  // A preflight cannot carry the header it asks about, and the library owns the allowed-header
  // list, so it goes through unauthed; only a real call needs a token.
  const scope =
    event.req.method === 'OPTIONS' ? null : await authenticateToken(DB, event.req.headers.get('Authorization'))
  if (event.req.method !== 'OPTIONS' && !scope) return unauthorized()
  // Wrangler supplies the real execution context; Vite's platform proxy does not.
  const cloudflare = event.req.runtime?.cloudflare as unknown as { env: unknown; context: ExecutionContext } | undefined
  const ctx =
    cloudflare?.context ??
    ({
      waitUntil: (work: Promise<unknown>) => void work.catch(() => {}),
      passThroughOnException() {},
    } as unknown as ExecutionContext)
  if (scope) ctx.waitUntil(touchToken(DB, scope.id))
  const handler = createMcpHandler(
    () => {
      if (!scope) throw new Error('未认证的请求不应创建 MCP 服务器')
      return createMcpServer(DB, scope)
    },
    { allowedOriginHostnames: '*' },
  )
  return handler(event.req as unknown as Request, cloudflare?.env ?? {}, ctx)
})
