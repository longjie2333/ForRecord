import type { Post, Site } from './posts.ts'

// A preview shows prose, so block-level syntax is dropped wherever it appears:
// markers the editor keeps in the text, and inline constructs that carry a URL.
const SYNTAX: [RegExp, string][] = [
  [/^ {0,3}\|?[\s:|-]*-[\s:|-]*$/gm, ''],
  [/`{1,3}/g, ''],
  [/^ {0,3}#{1,6}[ \t]+/gm, ''],
  [/^ {0,3}>[ \t]?/gm, ''],
  [/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/gm, ''],
  [/^ {0,3}\[[ xX]\][ \t]+/gm, ''],
  [/^ {0,3}\[toc\][ \t]*$/gim, ''],
  [/!\[[^\]]*\]\([^)]*\)/g, ''],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/[*_~]{1,3}/g, ''],
  [/<\/?[a-z][^>]*>/gi, ''],
  [/[|\n]+/g, ' '],
]

// Front matter and fenced blocks are removed whole before splitting: their lines
// are not prose, and a fenced block that spans paragraphs would otherwise leave
// its bare source in the middle of one.
const SKIPPED = [
  /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
  /^ {0,3}(?:```|~~~)[^\n]*$[\s\S]*?^ {0,3}(?:```|~~~)[^\n]*$/gm,
]

const flatten = (block: string) =>
  SYNTAX.reduce((plain, [pattern, replacement]) => plain.replace(pattern, replacement), block)
    .replace(/\s+/g, ' ')
    .trim()

const clip = (text: string, limit: number) => {
  const chars = [...text]
  if (chars.length <= limit) return text
  const cut = chars.slice(0, limit).join('')
  // A card cut mid-sentence reads as broken text; end on the last full sentence
  // when one falls in the final stretch of the budget.
  const sentence = Math.max(...[...'。！？!?;；'].map((mark) => cut.lastIndexOf(mark)))
  return `${sentence > limit * 0.6 ? cut.slice(0, sentence + 1) : cut.trimEnd()}…`
}

// A block that opens as a heading, list, table or directive is not prose: its
// lines lose their punctuation when the markers go, so the pieces read as one
// broken sentence. Those blocks are skipped rather than flattened.
const BLOCK_START = /^ {0,3}(?:#{1,6}[ \t]|[-+*][ \t]|\d+[.)][ \t]|\[[ xX]\][ \t]|\[toc\]|\||:?-{3,})/i

/**
 * The prose a link preview shows. Blocks are kept whole so a heading or a list
 * item never runs into the sentence before it, and enough paragraphs are taken to
 * clear a floor that a one-line opening cannot fill on its own. The leading H1
 * repeats the note title, which the card carries in its own field.
 */
export const excerpt = (markdown: string, limit = 120) => {
  const source = SKIPPED.reduce((text, pattern) => text.replace(pattern, ''), markdown).replace(/^\s+/, '')
  const blocks = source.split(/^[ \t]*\n/m)
  if (/^ {0,3}#[ \t]/.test(blocks[0] ?? '')) blocks.shift()
  let text = ''
  for (const block of blocks) {
    if (BLOCK_START.test(block)) continue
    const line = flatten(block)
    if (!line) continue
    text = text ? `${text} ${line}` : line
    if (text.length >= limit / 2) break
  }
  return clip(text, limit)
}

export const structuredData = ({
  site,
  post,
  url,
  description,
}: {
  site: Site
  post: Post
  url: string
  description: string
}) =>
  post.id === 1
    ? {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.title,
        description,
        url,
        inLanguage: 'zh-CN',
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description,
        url,
        mainEntityOfPage: url,
        datePublished: post.createon,
        author: { '@type': 'Person', name: site.author },
        publisher: { '@type': 'Organization', name: site.title },
        inLanguage: 'zh-CN',
      }
