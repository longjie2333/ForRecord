import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { siteToday } from '../../shared/posts.ts'
import { scopeWrites, tokenModeLabel, type TokenScope } from '../../shared/tokens.ts'
import { normalizePath } from '../../shared/tree.ts'
import { createPost, deletePost, readPost, updatePost } from './posts.ts'
import { readClause, writeClause } from './scope.ts'

type PostRow = { id: number; title: string; createon: string }

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })
const deny = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true })
const attempt = async (work: () => Promise<string>) => {
  try {
    return text(await work())
  } catch (error) {
    return deny(error instanceof Error ? error.message : '操作失败')
  }
}

// A body is a list of lines, and one trailing newline closes the text instead of
// opening an empty last line: line N is what a reader sees at N.
const toLines = (value: string) => {
  if (!value) return []
  const lines = value.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

const joinLines = (lines: string[], terminated: boolean) =>
  lines.length ? lines.join('\n') + (terminated ? '\n' : '') : ''

const range = (from: number, to: number) => (from === to ? `第 ${from} 行` : `第 ${from}–${to} 行`)

const numbered = (lines: string[], from: number, to: number) =>
  lines
    .slice(from - 1, to)
    .map((line, index) => `${from + index}│ ${line}`)
    .join('\n')

// A keyword is text: `%` and `_` would otherwise read as LIKE syntax.
const likeTerm = (query: string) => `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

const titleOf = (value: string) => {
  const path = normalizePath(value)
  if (!path) throw new Error('标题不能为空，也不能包含 “..”')
  return path
}

/**
 * The tools a token may use, bound to its scope. Rebuilt per request: the scope is a
 * parameter, not session state. A read-only token is never offered a write.
 */
export const createMcpServer = (db: D1Database, scope: TokenScope) => {
  const server = new McpServer({ name: 'for-record', version: '1.0.0' })
  const canWrite = scope.mode !== 'guest'
  const reads = readClause(scope)
  const writes = writeClause(scope)

  server.registerTool(
    'describe_access',
    {
      title: '查看授权范围',
      description: '返回当前令牌的权限与可读写范围。先调用它来确定自己能做什么。',
      annotations: { readOnlyHint: true },
    },
    async () =>
      text(
        [
          `权限：${tokenModeLabel[scope.mode]}`,
          ...(scope.dirs.length ? [`目录：${scope.dirs.join('、')}`] : []),
          scope.mode === 'scoped' ? '可读：仅上述目录' : '可读：全部笔记',
          canWrite ? (scope.mode === 'full' ? '可写：全部笔记' : '可写：仅上述目录') : '可写：无',
        ].join('\n'),
      ),
  )

  server.registerTool(
    'list_notes',
    {
      title: '列出笔记',
      description: '按 id 倒序列出可读的笔记，可用关键词搜索标题和正文。',
      inputSchema: z.object({
        query: z.string().optional().describe('关键词，匹配标题或正文'),
        limit: z.number().int().min(1).max(100).optional().describe('返回条数，默认 30'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, limit }) =>
      attempt(async () => {
        const term = query ? likeTerm(query) : null
        const { results } = await db
          .prepare(
            `SELECT id,title,createon FROM notes WHERE (${reads.sql})${
              term ? " AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')" : ''
            } ORDER BY id DESC LIMIT ?`,
          )
          .bind(...reads.params, ...(term ? [term, term] : []), limit ?? 30)
          .all<PostRow>()
        if (!results.length) return '没有可读的笔记。'
        return [
          `共 ${results.length} 篇（id | 标题 | 日期）`,
          ...results.map((row) => `${row.id} | ${row.title} | ${row.createon}`),
        ].join('\n')
      }),
  )

  server.registerTool(
    'note_lines',
    {
      title: canWrite ? '按行读写笔记' : '按行读取笔记',
      description: canWrite
        ? '按行范围读取或改写笔记正文，改动局部内容时优先用它而不是整篇读写：查看某几行、替换某几行、在某行上下或首尾插入、删掉某几行。行号从 1 开始，返回的行都带行号。'
        : '按行范围读取笔记正文，行号从 1 开始，返回的行都带行号。',
      inputSchema: z.object({
        id: z.number().int().describe('笔记 id，来自 list_notes'),
        op: (canWrite ? z.enum(['read', 'replace', 'insert', 'delete']) : z.enum(['read']))
          .default('read')
          .describe(canWrite ? 'read 查看、replace 替换、insert 插入、delete 删除' : '只能是 read'),
        start: z.number().int().min(1).optional().describe('起始行号；read 同时省略 start 与 end 时读取整篇'),
        end: z.number().int().min(1).optional().describe('结束行号，默认与 start 相同'),
        position: z
          .enum(['before', 'after', 'top', 'bottom'])
          .optional()
          .describe('insert 的位置：before/after 配合 start，top/bottom 忽略行号'),
        content: z.string().optional().describe('replace 或 insert 的新内容，可以含换行'),
      }),
      annotations: { readOnlyHint: !canWrite },
    },
    ({ id, op, start, end, position, content }) =>
      attempt(async () => {
        const clause = op === 'read' ? reads : writes
        const post = await readPost(db, id, clause)
        const lines = toLines(post.content)
        const total = lines.length
        const outOfRange = () => new Error(`行号超出范围：这篇笔记共 ${total} 行`)

        if (op === 'read') {
          if (!total) return `${post.title} · ${post.createon} · 共 0 行\n（空笔记）`
          const from = start ?? 1
          const to = end ?? start ?? total
          if (to < from) throw new Error('end 不能小于 start')
          if (from > total || to > total) throw outOfRange()
          const extent = from === 1 && to === total ? `共 ${total} 行` : `共 ${total} 行，本次${range(from, to)}`
          return `${post.title} · ${post.createon} · ${extent}\n${numbered(lines, from, to)}`
        }

        const save = (next: string[]) =>
          updatePost(
            db,
            id,
            { title: post.title, content: joinLines(next, post.content.endsWith('\n')), createon: post.createon },
            clause,
          )

        if (op === 'insert') {
          const inserted = toLines(content ?? '')
          if (!inserted.length) throw new Error('插入内容不能为空')
          const at = position ?? 'after'
          const relative = at === 'before' || at === 'after'
          if (relative && start === undefined) throw new Error('insert 需要 start 配合 before 或 after')
          if (relative && start! > total + 1) throw outOfRange()
          const index = at === 'top' ? 0 : at === 'bottom' ? total : at === 'before' ? start! - 1 : start!
          const label = relative
            ? `${range(start!, start!)}${at === 'before' ? '之前' : '之后'}`
            : at === 'top'
              ? '笔记顶部'
              : '笔记底部'
          const next = [...lines.slice(0, index), ...inserted, ...lines.slice(index)]
          await save(next)
          return `已插入到${label}，现在共 ${next.length} 行\n${numbered(next, index + 1, index + inserted.length)}`
        }

        // `delete` is a replacement with nothing.
        if (start === undefined) throw new Error(`${op} 需要 start`)
        const to = end ?? start
        if (to < start) throw new Error('end 不能小于 start')
        if (to > total) throw outOfRange()
        const inserted = op === 'delete' ? [] : toLines(content ?? '')
        const next = [...lines.slice(0, start - 1), ...inserted, ...lines.slice(to)]
        await save(next)
        if (!inserted.length) return `已删除${range(start, to)}，现在共 ${next.length} 行`
        const rewrite =
          inserted.length === to - start + 1
            ? `已替换${range(start, to)}`
            : `已把${range(start, to)}换成 ${inserted.length} 行`
        return `${rewrite}，现在共 ${next.length} 行\n${numbered(next, start, start + inserted.length - 1)}`
      }),
  )

  if (!canWrite) return server

  server.registerTool(
    'create_note',
    {
      title: '新建笔记',
      description: '新建一篇笔记。标题即路径，用 “/” 表示目录，例如 “日记/2026-10-24”。',
      inputSchema: z.object({
        title: z.string().describe('标题，也是它在目录树里的路径'),
        content: z.string().describe('Markdown 正文'),
        createon: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
      }),
    },
    ({ title, content, createon }) =>
      attempt(async () => {
        const path = titleOf(title)
        // A new title is not in the table yet, so `scopeWrites` is the only check it gets.
        if (!scopeWrites(scope, path)) throw new Error(`当前令牌不能新建笔记到 ${path}`)
        const post = await createPost(db, { title: path, content, createon: createon ?? siteToday() })
        return `已创建 #${post.id}：${post.title}`
      }),
  )

  server.registerTool(
    'update_note',
    {
      title: '更新笔记',
      description: '改写一篇笔记的标题、正文或日期，只传要改的字段。只动正文里的几行时改用 note_lines。',
      inputSchema: z.object({
        id: z.number().int().describe('笔记 id'),
        title: z.string().optional().describe('新标题，可借它移动目录'),
        content: z.string().optional().describe('新的 Markdown 正文'),
        createon: z.string().optional().describe('新日期 YYYY-MM-DD'),
      }),
    },
    ({ id, title, content, createon }) =>
      attempt(async () => {
        const post = await readPost(db, id, writes)
        const path = titleOf(title ?? post.title)
        // The destination is a title the request carries, not a stored row.
        if (!scopeWrites(scope, path)) throw new Error(`当前令牌不能把笔记写到 ${path}`)
        const next = await updatePost(
          db,
          id,
          { title: path, content: content ?? post.content, createon: createon ?? post.createon },
          writes,
        )
        return `已更新 #${id}：${next.title}`
      }),
  )

  server.registerTool(
    'delete_note',
    {
      title: '删除笔记',
      description: '删除一篇笔记，无法恢复。',
      inputSchema: z.object({ id: z.number().int().describe('笔记 id') }),
      annotations: { destructiveHint: true },
    },
    ({ id }) =>
      attempt(async () => {
        const post = await readPost(db, id, writes)
        await deletePost(db, id, writes)
        return `已删除 #${id}：${post.title}`
      }),
  )

  return server
}
