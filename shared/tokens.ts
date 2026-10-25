/**
 * Permissions for an issued MCP token. A title is its path (`日记/2026-10-24`), so a
 * directory is a title prefix. A stored row is decided by the SQL condition in
 * `server/utils/scope.ts`; this file only decides a title a request is about to create.
 */
export const tokenModes = ['guest', 'full', 'scoped', 'scoped-read'] as const

export type TokenMode = (typeof tokenModes)[number]

export interface TokenScope {
  mode: TokenMode
  dirs: string[]
}

export interface McpToken {
  id: number
  label: string
  mode: TokenMode
  dirs: string[]
  createon: string
  expireson: string | null
  lastusedon: string | null
  revokedon: string | null
}

export const tokenModeLabel: Record<TokenMode, string> = {
  guest: '只读',
  full: '全权限',
  scoped: '目录内读写',
  'scoped-read': '目录内读写，其余只读',
}

export const tokenModeScoped = (mode: TokenMode) => mode === 'scoped' || mode === 'scoped-read'

/** `a//b/./c` is the same path as `a/b/c`; a `..` segment is not a title. */
export const normalizePath = (value: string): string | null => {
  const parts = value
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.')
  return parts.includes('..') ? null : parts.join('/')
}

export const normalizePaths = (values: readonly string[]): string[] | null => {
  const paths: string[] = []
  for (const value of values) {
    const path = normalizePath(value)
    if (path === null) return null
    if (path) paths.push(path)
  }
  return [...new Set(paths)]
}

export const inDirectories = (dirs: readonly string[], title: string) =>
  dirs.some((dir) => title === dir || title.startsWith(`${dir}/`))

export const scopeWrites = (scope: TokenScope, title: string) =>
  scope.mode === 'full' || (tokenModeScoped(scope.mode) && inDirectories(scope.dirs, title))
