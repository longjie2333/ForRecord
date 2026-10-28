/** The server refused the session or the code: the caller asks for a code again. */
export class Unauthorized extends Error {}

/**
 * Every browser call to `/api` goes through here, so a network failure, an HTML error page
 * from the platform or a 401 reads the same everywhere instead of surfacing a parse error.
 */
export const requestJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch {
    throw new Error('网络连接失败，请稍后重试')
  }
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null
  const message = payload?.message || `请求失败（${response.status}），请稍后重试`
  if (response.status === 401) throw new Unauthorized(message)
  if (!response.ok || payload === null) throw new Error(message)
  return payload
}
