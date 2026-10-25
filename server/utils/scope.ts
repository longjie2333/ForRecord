import { tokenModeScoped, type TokenScope } from '../../shared/tokens.ts'

/**
 * A SQL condition with the values it binds, kept together so a caller can only
 * append placeholders and never a title from the request.
 */
export interface Clause {
  sql: string
  params: string[]
}

const ALWAYS: Clause = { sql: '1', params: [] }
const NEVER: Clause = { sql: '0', params: [] }

/**
 * The SQL twin of `inDirectories` in `shared/tokens.ts`, and it has to stay one.
 * `LIKE` cannot express that comparison: SQLite folds ASCII case, so `LIKE 'Notes/%'`
 * also matches `notes/x`, which would widen a directory boundary instead of holding
 * it. `substr` and `length` count characters rather than bytes, so a directory whose
 * name holds an emoji stays whole, and neither treats `%` or `_` as syntax.
 */
const directories = (dirs: readonly string[]): Clause =>
  dirs.length
    ? {
        sql: dirs.map(() => '(title=? OR substr(title,1,length(?))=?)').join(' OR '),
        params: dirs.flatMap((dir) => [dir, `${dir}/`, `${dir}/`]),
      }
    : NEVER

/** The rows a scope may read: `scoped` stays inside its directories, every other mode reads all. */
export const readClause = (scope: TokenScope): Clause => (scope.mode === 'scoped' ? directories(scope.dirs) : ALWAYS)

/** The rows a scope may write: `full` everywhere, `scoped` and `scoped-read` inside their directories. */
export const writeClause = (scope: TokenScope): Clause =>
  scope.mode === 'full' ? ALWAYS : tokenModeScoped(scope.mode) ? directories(scope.dirs) : NEVER
