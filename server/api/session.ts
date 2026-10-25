import { defineHandler } from 'nitro'
import { setCookie } from 'nitro/h3'
import { getBindings } from '../utils/env.ts'
import { issueSession, requireCode, requireSameOrigin, sessionCookie, sessionLifetime } from '../utils/auth.ts'

export default defineHandler(async (event) => {
  const headers = { 'Cache-Control': 'no-store' }
  if (event.req.method !== 'POST') {
    return Response.json({ message: '不支持的请求方法' }, { status: 405, headers: { ...headers, Allow: 'POST' } })
  }
  requireSameOrigin(event)
  const { SECRET, JWT_SECRET } = getBindings(event)
  requireCode(event.req, SECRET)
  const session = await issueSession(JWT_SECRET)
  setCookie(event, sessionCookie, session.token, {
    httpOnly: true,
    secure: event.url.protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionLifetime,
  })
  // The token stays in the cookie: a copy in the body would hand any script a bearer it could
  // replay after the cookie expires.
  return Response.json({ expiresAt: session.expiresAt }, { headers })
})
