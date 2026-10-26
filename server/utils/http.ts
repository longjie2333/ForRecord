import { HTTPError, type H3Event } from 'nitro'

/** Every API answer depends on the session or the table, so none of them may be cached. */
export const noStore = { 'Cache-Control': 'no-store' }

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore })

/** Answers 405 with `Allow` unless the method is listed; HEAD rides on GET. Returns the method. */
export const requireMethod = (event: H3Event, allowed: readonly string[]) => {
  const method = event.req.method === 'HEAD' && allowed.includes('GET') ? 'GET' : event.req.method
  if (!allowed.includes(method)) {
    const allow = allowed.includes('GET') ? ['GET', 'HEAD', ...allowed.filter((name) => name !== 'GET')] : allowed
    throw new HTTPError({
      status: 405,
      message: '不支持的请求方法',
      headers: { ...noStore, Allow: allow.join(', ') },
    })
  }
  return method
}

/** A positive integer route segment, or the 404 the resource would answer anyway. */
export const routeId = (event: H3Event, missing: string) => {
  const value = event.context.params?.id ?? ''
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
    throw new HTTPError({ status: 404, message: missing, headers: noStore })
  }
  return id
}

export const readJson = async (event: H3Event): Promise<unknown> => {
  try {
    return await event.req.json()
  } catch {
    throw new HTTPError({ status: 400, message: '请求正文必须为 JSON', headers: noStore })
  }
}
