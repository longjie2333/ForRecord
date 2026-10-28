import type { Post, Site } from './posts.ts'

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

// Removed whole before the split: a fence spanning paragraphs would leave its source
// mid-sentence.
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
  // A card cut mid-sentence reads as broken, so end on the last full sentence when one is near.
  const sentence = Math.max(...[...'。！？!?;；'].map((mark) => cut.lastIndexOf(mark)))
  return `${sentence > limit * 0.6 ? cut.slice(0, sentence + 1) : cut.trimEnd()}…`
}

// A block that opens as a heading, list or table is not prose: without its markers it reads
// as one broken sentence, so it is skipped rather than flattened.
const BLOCK_START = /^ {0,3}(?:#{1,6}[ \t]|[-+*][ \t]|\d+[.)][ \t]|\[[ xX]\][ \t]|\[toc\]|\||:?-{3,})/i

/**
 * The prose a link preview shows: blocks stay whole. The leading H1 is dropped, because the
 * card carries the title itself.
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
  headline,
}: {
  site: Site
  post: Post
  url: string
  description: string
  headline: string
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
        headline,
        description,
        url,
        mainEntityOfPage: url,
        datePublished: post.createon,
        author: { '@type': 'Person', name: site.author },
        publisher: { '@type': 'Organization', name: site.title },
        inLanguage: 'zh-CN',
      }
