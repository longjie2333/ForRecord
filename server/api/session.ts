import { defineHandler } from 'nitro'
import { setCookie } from 'nitro/h3'
import { getBindings } from '../utils/env.ts'
import { issueSession, requireCode, requireSameOrigin, sessionCookie, sessionLifetime } from '../utils/auth.ts'
import { json, requireMethod } from '../utils/http.ts'

export default defineHandler(async (event) => {
  requireMethod(event, ['POST'])
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
  return json({ expiresAt: session.expiresAt })
})
