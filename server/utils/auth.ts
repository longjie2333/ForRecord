import { TOTP } from 'otpauth'
import { HTTPError, type H3Event } from 'nitro'
import { getCookie } from 'nitro/h3'
import { jwtVerify, SignJWT } from 'jose'

export const sessionCookie = 'for-record-session'
export const sessionLifetime = 3600
const authHeaders = { 'Cache-Control': 'no-store' }

// SHA-1, six digits, current 30-second step only.
export const verifyCode = (secret: string, code: string | null, timestamp = Date.now()) =>
  !!code &&
  /^\d{6}$/.test(code) &&
  new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 }).validate({ token: code, timestamp, window: 0 }) === 0

export const requireCode = (request: Pick<Request, 'headers'>, secret: string) => {
  if (!secret) throw new HTTPError({ status: 503, message: '未配置动态码密钥', headers: authHeaders })
  if (!verifyCode(secret, request.headers.get('Code'))) {
    throw new HTTPError({ status: 401, message: '动态码不正确或已过期，请重试', headers: authHeaders })
  }
}

export const requireSameOrigin = (event: H3Event) => {
  const origin = event.req.headers.get('Origin')
  if (origin && origin !== event.url.origin)
    throw new HTTPError({ status: 403, message: '不允许跨站写入', headers: authHeaders })
}

const signingKey = (secret: string) => {
  const key = new TextEncoder().encode(secret || '')
  if (key.length < 32) {
    throw new HTTPError({ status: 503, message: '请配置至少 32 字节的 JWT 签名密钥', headers: authHeaders })
  }
  return key
}

export const issueSession = async (secret: string) => {
  const key = signingKey(secret)
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('owner')
    .setIssuer('for-record')
    .setAudience('for-record-api')
    .setIssuedAt(now)
    .setExpirationTime(now + sessionLifetime)
    .sign(key)
  return { token, expiresAt: (now + sessionLifetime) * 1000 }
}

export const readSession = async (event: H3Event, secret: string) => {
  const authorization = event.req.headers.get('Authorization')
  const token = authorization ? /^Bearer (\S+)$/i.exec(authorization)?.[1] : getCookie(event, sessionCookie)
  if (!token || !secret) return null
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      algorithms: ['HS256'],
      issuer: 'for-record',
      audience: 'for-record-api',
      subject: 'owner',
      requiredClaims: ['iat', 'exp', 'sub'],
      maxTokenAge: sessionLifetime,
    })
    return { expiresAt: payload.exp! * 1000 }
  } catch {
    return null
  }
}

export const requireSession = async (event: H3Event, secret: string) => {
  requireSameOrigin(event)
  if (!(await readSession(event, secret))) {
    throw new HTTPError({ status: 401, message: '验证已过期，请重新输入动态码', headers: authHeaders })
  }
}
