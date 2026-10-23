import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import MarkdownIt, { type Options, type Token } from 'markdown-it'
import { full as emoji } from 'markdown-it-emoji'
import { createHeadingId, plainHeading } from '../../shared/posts.ts'

// The server renders the note so the page reads without JavaScript and a crawler
// sees the prose. It targets the library's *reading* DOM: same tags, same classes,
// same attribute-driven decoration. Editor-only chrome (CodeMirror, the language
// picker, a rendered Mermaid diagram) stays out, because it is interactive state
// the live view builds for itself.
//
// Anything Markdown cannot express but the editor renders — raw HTML blocks, the
// `==`, `~x~`, `^x^` extensions — is left as literal text here. Injecting author
// HTML server-side would turn an imported .md file into stored XSS, and the notes
// themselves use nothing beyond <br>.

const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|DANGER)\][ \t]*\r?\n?/i
const TASK = /^\[([ xX])\][ \t]+/
const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const LANGUAGE = /^[a-z0-9#+.-]+$/i
// Stands in for `[toc]` until every heading has been seen and the outline is known.
const TOC = '\u0000toc\u0000'

interface Env {
  headingId: (text: string) => string
  headings: { level: string; text: string }[]
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: false })
md.use(emoji)
const escape = (text: string) => md.utils.escapeHtml(text)

const math = (tex: string, displayMode: boolean) => {
  try {
    return { html: katex.renderToString(tex, { displayMode, throwOnError: true }), state: 'success' }
  } catch {
    return { html: escape(tex), state: 'error' }
  }
}

// `<br>` is a line break in the note, not text. Every other tag stays escaped by
// the parser, so a note cannot hand the reader markup the editor would not render.
md.inline.ruler.before('text', 'br_tag', (state, silent) => {
  const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos, state.posMax))
  if (!match) return false
  if (!silent) state.push('hardbreak', 'br', 0)
  state.pos += match[0].length
  return true
})

// `$x$` is inline math when the dollars hug their content; `$ 5 ` and `$$` are prose.
md.inline.ruler.before('text', 'math_inline', (state, silent) => {
  const match = /^\$([^$\n]+)\$/.exec(state.src.slice(state.pos, state.posMax))
  if (!match) return false
  const tex = match[1]!
  if (!tex.trim() || /^\s/.test(tex) || /\s$/.test(tex)) return false
  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.content = tex
  }
  state.pos += match[0].length
  return true
})

// A `$$` block is closed by its own line, the way the editor fences it. Without a
// closing line it is prose, not a block that swallows the rest of the note.
md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine]! + state.tShift[startLine]!
  if (state.src.slice(start, state.eMarks[startLine]).trim() !== '$$') return false
  let close = startLine + 1
  const lines: string[] = []
  for (; close < endLine; close++) {
    const from = state.bMarks[close]! + state.tShift[close]!
    const line = state.src.slice(from, state.eMarks[close])
    if (line.trim() === '$$') break
    lines.push(line)
  }
  if (close >= endLine) return false
  if (silent) return true
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = lines.join('\n').trim()
  token.map = [startLine, close + 1]
  state.line = close + 1
  return true
})

md.block.ruler.before('paragraph', 'toc', (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine]! + state.tShift[startLine]!
  if (state.src.slice(start, state.eMarks[startLine]).trim().toLowerCase() !== '[toc]') return false
  if (silent) return true
  state.push('toc', 'div', 0)
  state.line = startLine + 1
  return true
})

md.renderer.rules.toc = () => TOC

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!
  const language = token.info.trim().split(/\s+/)[0] ?? ''
  const known = LANGUAGE.test(language) && hljs.getLanguage(language) ? language : ''
  const body = known
    ? hljs.highlight(token.content, { language: known, ignoreIllegals: true }).value
    : escape(token.content)
  return `<pre class="hljs"><code${known ? ` class="language-${known} hljs"` : ''}>${body}</code></pre>\n`
}

md.renderer.rules.math_inline = (tokens, idx) => {
  const tex = tokens[idx]!.content
  const { html, state } = math(tex, false)
  return `<math-inline data-tex="${escape(tex)}" data-math-state="${state}" class="ProseMirror-widget">${html}</math-inline>`
}

md.renderer.rules.math_block = (tokens, idx) => {
  const tex = tokens[idx]!.content
  const { html, state } = math(tex, true)
  // The source strip is an editing aid: the reading view hides it, so it is left
  // out rather than shipped and hidden again.
  return `<math-block><math-preview data-math-state="${state}">${html}</math-preview></math-block>\n`
}

md.renderer.rules.checkbox = (tokens, idx) =>
  `<span class="checkbox-frame"><span class="checkbox" data-checked="${tokens[idx]!.content}"></span></span>`

const inlineText = (token: Token | undefined) =>
  (token?.children ?? [])
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('')

// Headings carry no anchor in Markdown; the editor derives one from the text, so
// the outline and deep links must come out identical here.
md.renderer.rules.heading_open = (tokens, idx, options: Options, env: Env, self) => {
  const token = tokens[idx]!
  const text = plainHeading(inlineText(tokens[idx + 1]))
  token.attrSet('id', env.headingId(text))
  env.headings.push({ level: token.tag, text })
  return self.renderToken(tokens, idx, options)
}

// `> [!NOTE]` becomes the labelled box the editor draws. Rewriting the marker
// before inline parsing keeps the paragraph's own token stream untouched.
md.core.ruler.before('inline', 'alert_marker', (state) => {
  const tokens = state.tokens
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.type !== 'blockquote_open') continue
    const inline = tokens[index + 2]
    if (tokens[index + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue
    const match = ALERT.exec(inline.content)
    if (!match) continue
    const kind = match[1]!.toLowerCase()
    const open = tokens[index]!
    open.attrJoin('class', `md-alert md-alert-${kind}`)
    open.attrSet('data-alert', kind)
    open.attrSet('data-alert-source', match[1]!.toUpperCase())
    inline.content = inline.content.slice(match[0].length)
  }
})

// A task item is a list item whose paragraph opens with `[ ]` or `[x]`; the marker
// becomes the checkbox node the editor's item view draws.
md.core.ruler.after('inline', 'task_markers', (state) => {
  const tokens = state.tokens
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.type !== 'list_item_open') continue
    const lead =
      tokens[index + 1]!.type === 'inline' ? index + 1 : tokens[index + 2]?.type === 'inline' ? index + 2 : -1
    if (lead < 0) continue
    const inline = tokens[lead]!
    const first = inline.children?.[0]
    const match = first?.type === 'text' ? TASK.exec(first.content) : null
    if (!match || !first) continue
    first.content = first.content.slice(match[0].length)
    inline.content = inline.content.slice(match[0].length)
    const box = new state.Token('checkbox', '', 0)
    box.content = match[1]!.toLowerCase() === 'x' ? '1' : '0'
    inline.children!.unshift(box)
  }
})

const outline = (headings: Env['headings']) =>
  headings.length
    ? `<div class="toc"><ul class="toc-list">${headings
        .map(({ level, text }) => `<li class="toc-item toc-${level}">${escape(text)}</li>`)
        .join('')}</ul></div>`
    : '<div class="toc toc-empty">暂无标题</div>'

/**
 * The note's reading view as HTML, wrapped in the same element chain the editor
 * builds, so the shared `.ProseMirror`-scoped typography applies before the live
 * view replaces it. `title` is the note's own first heading: it is what a reader
 * sees at the top of the page, which a preview and structured data quote. Empty
 * for a note without content.
 */
export const renderMarkdown = (markdown: string) => {
  if (!markdown.trim()) return { html: '', title: '' }
  const front = FRONT_MATTER.exec(markdown)
  const env: Env = { headingId: createHeadingId(), headings: [] }
  const html = md.render(front ? markdown.slice(front[0].length) : markdown, env).replace(TOC, outline(env.headings))
  const yaml = front ? `<yaml-block>${escape(front[1]!)}</yaml-block>` : ''
  return {
    html: `<div class="typora-web-wrap"><div class="typora-web-editor-host"><div class="ProseMirror">${yaml}${html}</div></div></div>`,
    title: env.headings.find(({ level }) => level === 'h1')?.text ?? '',
  }
}
