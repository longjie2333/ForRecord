import { defineHandler } from 'nitro'
import { createMcpHandler } from 'agents/mcp/server'
import { getBindings } from '../utils/env.ts'
import { createMcpServer } from '../utils/mcp.ts'
import { authenticateToken, touchToken } from '../utils/tokens.ts'

// No session and no cookie: every request carries its own bearer token, so the
// digest lookup in D1 is the entire authentication step.
//
// That is also why no Origin allowlist is passed: a browser sends no credential of
// its own to this endpoint, so an origin check would protect nothing while locking
// out every browser-based MCP client. Each request is authorised by the header the
// client chose to send, and a hostile page cannot supply it on the client's behalf.
// The Host allowlist is left unset on purpose as well. DNS-rebinding protection is
// for a service running on the visitor's own machine; this one is public by
// definition, and its authentication does not ride on ambient browser state. The
// library's default would otherwise accept only the hostname the request arrived
// on, which is exactly the check a deployment on a custom domain skips anyway.
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
  // A browser may not send an Authorization header until the endpoint has answered
  // for it, and that preflight cannot carry the header it is asking about. The
  // library owns the list of allowed headers, so the preflight goes to it unauthed
  // rather than being duplicated here; only a real call needs a token.
  const scope =
    event.req.method === 'OPTIONS' ? null : await authenticateToken(DB, event.req.headers.get('Authorization'))
  if (event.req.method !== 'OPTIONS' && !scope) return unauthorized()
  // Wrangler supplies the real execution context; Vite's platform proxy does not,
  // and a local preview has nothing to keep alive after the response.
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
