import { HTTPError } from 'nitro'
import { siteToday } from '../../shared/posts.ts'
import {
  normalizePaths,
  tokenModeScoped,
  tokenModes,
  type McpToken,
  type TokenMode,
  type TokenScope,
} from '../../shared/tokens.ts'

interface TokenRow {
  id: number
  label: string
  mode: TokenMode
  dirs: string
  createon: string
  expireson: string | null
  lastusedon: string | null
  revokedon: string | null
}

const encoder = new TextEncoder()

/** Only the digest reaches the database, so a leaked row cannot be replayed as a token. */
const digest = async (token: string) => {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const issue = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `fr_${encoded}`
}

const parseDirs = (value: string) => {
  try {
    const dirs = JSON.parse(value) as unknown
    return Array.isArray(dirs) ? dirs.filter((dir): dir is string => typeof dir === 'string') : []
  } catch {
    return []
  }
}

const toToken = (row: TokenRow): McpToken => ({ ...row, dirs: parseDirs(row.dirs) })

export const listTokens = async (db: D1Database): Promise<McpToken[]> => {
  const { results } = await db
    .prepare('SELECT id,label,mode,dirs,createon,expireson,lastusedon,revokedon FROM mcp_tokens ORDER BY id DESC')
    .all<TokenRow>()
  return results.map(toToken)
}

const validateToken = (input: unknown) => {
  const value = input as { label?: unknown; mode?: unknown; dirs?: unknown; expireson?: unknown } | null
  const label = typeof value?.label === 'string' ? value.label.trim() : ''
  if (!label || label.length > 40) {
    throw new HTTPError({ status: 400, message: '请填写不超过 40 字的令牌名称' })
  }
  const mode = tokenModes.find((candidate) => candidate === value?.mode)
  if (!mode) throw new HTTPError({ status: 400, message: '请选择权限类型' })
  const scoped = tokenModeScoped(mode)
  const requested = Array.isArray(value?.dirs) ? value.dirs.filter((dir) => typeof dir === 'string') : []
  const dirs = scoped ? normalizePaths(requested) : []
  if (dirs === null) throw new HTTPError({ status: 400, message: '目录不能包含 “..”' })
  if (scoped && !dirs.length) throw new HTTPError({ status: 400, message: '目录内读写的令牌至少要填一个目录' })
  const expireson =
    value?.expireson === null || value?.expireson === undefined || value?.expireson === '' ? null : value.expireson
  if (expireson !== null && (typeof expireson !== 'string' || !validDate(expireson) || expireson < siteToday())) {
    throw new HTTPError({ status: 400, message: '有效期必须是不早于今天的日期' })
  }
  return { label, mode, dirs, expireson }
}

const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

/** The raw token is returned once, at issue time, and never stored. */
export const createToken = async (db: D1Database, input: unknown) => {
  const { label, mode, dirs, expireson } = validateToken(input)
  const token = issue()
  const result = await db
    .prepare('INSERT INTO mcp_tokens (label, token_hash, mode, dirs, createon, expireson) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(label, await digest(token), mode, JSON.stringify(dirs), siteToday(), expireson)
    .run()
  return { id: Number(result.meta.last_row_id), token }
}

export const revokeToken = async (db: D1Database, id: number) => {
  const result = await db
    .prepare('UPDATE mcp_tokens SET revokedon=? WHERE id=? AND revokedon IS NULL')
    .bind(siteToday(), id)
    .run()
  if (!result.meta.changes) throw new HTTPError({ status: 404, message: '令牌不存在或已吊销' })
}

/** Only a revoked or an expired row may be removed: dropping a live row would break a client silently. */
export const deleteToken = async (db: D1Database, id: number) => {
  // The eligibility is part of the statement: the row cannot go live between check and delete.
  const removed = await db
    .prepare(
      'DELETE FROM mcp_tokens WHERE id=? AND (revokedon IS NOT NULL OR (expireson IS NOT NULL AND expireson < ?))',
    )
    .bind(id, siteToday())
    .run()
  if (removed.meta.changes) return
  const row = await db.prepare('SELECT id FROM mcp_tokens WHERE id=?').bind(id).first()
  if (!row) throw new HTTPError({ status: 404, message: '令牌不存在' })
  throw new HTTPError({ status: 400, message: '请先吊销这个令牌再删除' })
}

export interface AuthenticatedToken extends TokenScope {
  id: number
}

/** Every MCP request carries its own bearer token; the digest lookup is the whole session. */
export const authenticateToken = async (db: D1Database, authorization: string | null) => {
  const token = /^Bearer (\S+)$/i.exec(authorization ?? '')?.[1]
  if (!token) return null
  // Revocation and expiry are conditions of the lookup, so a rejected token never yields a scope.
  const row = await db
    .prepare(
      'SELECT id,mode,dirs FROM mcp_tokens WHERE token_hash=? AND revokedon IS NULL AND (expireson IS NULL OR expireson >= ?)',
    )
    .bind(await digest(token), siteToday())
    .first<Pick<TokenRow, 'id' | 'mode' | 'dirs'>>()
  if (!row) return null
  return { id: row.id, mode: row.mode, dirs: parseDirs(row.dirs) } satisfies AuthenticatedToken
}

/** One write per token per day: the list only needs to say when it was last used. */
export const touchToken = async (db: D1Database, id: number) => {
  const day = siteToday()
  await db
    .prepare('UPDATE mcp_tokens SET lastusedon=? WHERE id=? AND (lastusedon IS NULL OR lastusedon<>?)')
    .bind(day, id, day)
    .run()
}
