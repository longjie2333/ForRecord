/**
 * Permissions for a manually issued MCP token. A note's title is its path
 * (`日记/2026-10-24`), so a directory is a title prefix and every check is a
 * prefix comparison on the title. A check against a stored note is a SQL
 * condition instead (`server/utils/scope.ts`), so this file only decides about a
 * title a request is about to create.
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

// Only a title that is about to be created is decided here: everything read from
// the table is decided by the SQL condition in `server/utils/scope.ts`, whose
// `substr` comparison is this function's twin and must never drift from it.
export const scopeWrites = (scope: TokenScope, title: string) =>
  scope.mode === 'full' || (tokenModeScoped(scope.mode) && inDirectories(scope.dirs, title))
