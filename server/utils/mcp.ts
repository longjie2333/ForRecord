import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { siteToday } from '../../shared/posts.ts'
import { normalizePath, scopeReads, scopeWrites, tokenModeLabel, type TokenScope } from '../../shared/tokens.ts'
import { readPost, validatePost } from './posts.ts'

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

// A note's body is a list of lines, and one trailing newline closes the text
// rather than opening an empty last line: line N is what a reader sees at N.
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

/**
 * The tools a token may use, bound to its scope. The server is rebuilt for every
 * request, so the scope is a parameter rather than session state.
 */
export const createMcpServer = (db: D1Database, scope: TokenScope) => {
  const server = new McpServer({ name: 'for-record', version: '1.0.0' })
  const writable = scope.mode !== 'guest'
  const where = scope.mode === 'scoped' ? `只能在 ${scope.dirs.join('、')} 下` : ''

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
          writable ? (scope.mode === 'full' ? '可写：全部笔记' : '可写：仅上述目录') : '可写：无',
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
        const { results } = await (query
          ? db
              .prepare(
                'SELECT id,title,createon FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY id DESC LIMIT 200',
              )
              .bind(`%${query}%`, `%${query}%`)
              .all<PostRow>()
          : db.prepare('SELECT id,title,createon FROM notes ORDER BY id DESC LIMIT 200').all<PostRow>())
        const visible = results.filter((row) => scopeReads(scope, row.title)).slice(0, limit ?? 30)
        if (!visible.length) return '没有可读的笔记。'
        return [
          `共 ${visible.length} 篇（id | 标题 | 日期）`,
          ...visible.map((row) => `${row.id} | ${row.title} | ${row.createon}`),
        ].join('\n')
      }),
  )

  server.registerTool(
    'note_lines',
    {
      title: '按行读写笔记',
      description:
        '按行范围读取或改写笔记正文，改动局部内容时优先用它而不是整篇读写：查看某几行、替换某几行、在某行上下或首尾插入、删掉某几行。行号从 1 开始，返回的行都带行号。',
      inputSchema: z.object({
        id: z.number().int().describe('笔记 id，来自 list_notes'),
        op: z
          .enum(['read', 'replace', 'insert', 'delete'])
          .default('read')
          .describe('read 查看、replace 替换、insert 插入、delete 删除'),
        start: z.number().int().min(1).optional().describe('起始行号；read 同时省略 start 与 end 时读取整篇'),
        end: z.number().int().min(1).optional().describe('结束行号，默认与 start 相同'),
        position: z
          .enum(['before', 'after', 'top', 'bottom'])
          .optional()
          .describe('insert 的位置：before/after 配合 start，top/bottom 忽略行号'),
        content: z.string().optional().describe('replace 或 insert 的新内容，可以含换行'),
      }),
    },
    ({ id, op, start, end, position, content }) =>
      attempt(async () => {
        const post = await readPost(db, id)
        if (!scopeReads(scope, post.title)) throw new Error(`当前令牌不能读取 ${post.title}`)
        const lines = toLines(post.content)
        const total = lines.length
        const terminated = post.content.endsWith('\n')
        const located = `${post.title} · ${post.createon}`
        const outOfRange = () => new Error(`行号超出范围：这篇笔记共 ${total} 行`)

        if (op === 'read') {
          if (!total) return `${located} · 共 0 行\n（空笔记）`
          const from = start ?? 1
          const to = end ?? start ?? total
          if (to < from) throw new Error('end 不能小于 start')
          if (from > total || to > total) throw outOfRange()
          const extent = from === 1 && to === total ? `共 ${total} 行` : `共 ${total} 行，本次${range(from, to)}`
          return `${located} · ${extent}\n${numbered(lines, from, to)}`
        }

        if (!scopeWrites(scope, post.title)) throw new Error(`当前令牌${where || '不能'}修改 ${post.title}`)
        const save = async (next: string[]) => {
          const updated = validatePost({
            title: post.title,
            content: joinLines(next, terminated),
            createon: post.createon,
          })
          await db
            .prepare('UPDATE notes SET title=?, content=?, createon=? WHERE id=?')
            .bind(updated.title, updated.content, updated.createon, id)
            .run()
        }

        if (op === 'replace') {
          if (start === undefined) throw new Error('replace 需要 start')
          const to = end ?? start
          if (to < start) throw new Error('end 不能小于 start')
          if (to > total) throw outOfRange()
          const inserted = toLines(content ?? '')
          const next = [...lines.slice(0, start - 1), ...inserted, ...lines.slice(to)]
          await save(next)
          if (!inserted.length) return `已删除${range(start, to)}，现在共 ${next.length} 行`
          const last = start + inserted.length - 1
          const rewrite =
            inserted.length === to - start + 1
              ? `已替换${range(start, to)}`
              : `已把${range(start, to)}换成 ${inserted.length} 行`
          return `${rewrite}，现在共 ${next.length} 行\n${numbered(next, start, last)}`
        }

        if (op === 'delete') {
          if (start === undefined) throw new Error('delete 需要 start')
          const to = end ?? start
          if (to < start) throw new Error('end 不能小于 start')
          if (to > total) throw outOfRange()
          const next = [...lines.slice(0, start - 1), ...lines.slice(to)]
          await save(next)
          return `已删除${range(start, to)}，现在共 ${next.length} 行`
        }

        const inserted = toLines(content ?? '')
        if (!inserted.length) throw new Error('插入内容不能为空')
        const at = position ?? 'after'
        let index = total
        let label = '笔记底部'
        if (at === 'top') {
          index = 0
          label = '笔记顶部'
        } else if (at === 'before' || at === 'after') {
          if (start === undefined) throw new Error('insert 需要 start 配合 before 或 after')
          if (start > total + 1) throw outOfRange()
          index = at === 'before' ? start - 1 : start
          label = `${range(start, start)}${at === 'before' ? '之前' : '之后'}`
        }
        const next = [...lines.slice(0, index), ...inserted, ...lines.slice(index)]
        await save(next)
        return `已插入到${label}，现在共 ${next.length} 行\n${numbered(next, index + 1, index + inserted.length)}`
      }),
  )

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
        const path = normalizePath(title)
        if (!path) throw new Error('标题不能为空，也不能包含 “..”')
        if (!scopeWrites(scope, path)) throw new Error(`当前令牌${where || '不能'}新建笔记`)
        const post = validatePost({ title: path, content, createon: createon ?? siteToday() })
        const result = await db
          .prepare('INSERT INTO notes (title, content, createon) VALUES (?, ?, ?)')
          .bind(post.title, post.content, post.createon)
          .run()
        return `已创建 #${result.meta.last_row_id}：${post.title}`
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
        const post = await readPost(db, id)
        if (!scopeWrites(scope, post.title)) throw new Error(`当前令牌${where || '不能'}修改 ${post.title}`)
        const path = title === undefined ? post.title : normalizePath(title)
        if (!path) throw new Error('标题不能为空，也不能包含 “..”')
        if (!scopeWrites(scope, path)) throw new Error(`当前令牌不能把笔记改到 ${path}`)
        if (id === 1 && path !== 'README') throw new Error('首页标题必须为 README')
        const next = validatePost({
          title: path,
          content: content ?? post.content,
          createon: createon ?? post.createon,
        })
        await db
          .prepare('UPDATE notes SET title=?, content=?, createon=? WHERE id=?')
          .bind(next.title, next.content, next.createon, id)
          .run()
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
        if (id === 1) throw new Error('首页 README 不能删除')
        const post = await readPost(db, id)
        if (!scopeWrites(scope, post.title)) throw new Error(`当前令牌${where || '不能'}删除 ${post.title}`)
        await db.prepare('DELETE FROM notes WHERE id=?').bind(id).run()
        return `已删除 #${id}：${post.title}`
      }),
  )

  return server
}
