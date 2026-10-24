import { defineHandler } from 'nitro'
import { createMcpHandler } from 'agents/mcp/server'
import { getBindings } from '../utils/env.ts'
import { createMcpServer } from '../utils/mcp.ts'
import { authenticateToken, touchToken } from '../utils/tokens.ts'

// No session and no cookie: every request carries its own bearer token, so the
// digest lookup in D1 is the entire authentication step.
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
  const scope = await authenticateToken(DB, event.req.headers.get('Authorization'))
  if (!scope) return unauthorized()
  // Wrangler supplies the real execution context; Vite's platform proxy does not,
  // and a local preview has nothing to keep alive after the response.
  const cloudflare = event.req.runtime?.cloudflare as unknown as { env: unknown; context: ExecutionContext } | undefined
  const ctx =
    cloudflare?.context ??
    ({
      waitUntil: (work: Promise<unknown>) => void work.catch(() => {}),
      passThroughOnException() {},
    } as unknown as ExecutionContext)
  ctx.waitUntil(touchToken(DB, scope.id))
  const handler = createMcpHandler(() => createMcpServer(DB, scope))
  return handler(event.req as unknown as Request, cloudflare?.env ?? {}, ctx)
})
