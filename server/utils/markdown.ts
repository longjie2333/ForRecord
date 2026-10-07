import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'
import { visit } from 'unist-util-visit'
import type { Root } from 'hast'
import { createHeadingId, type Heading } from '../../shared/posts.ts'

// Milkdown uses remark/CommonMark + GFM too. Its DOM-based editor is loaded only in the browser.
export const renderMarkdown = async (markdown: string) => {
  const headings: Heading[] = []
  const headingId = createHeadingId()
  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, {
      // Milkdown preserves HTML as literal text. Keep SSR consistent, without executing it.
      handlers: {
        html: (_state, node) => ({
          type: 'element',
          tagName: 'span',
          properties: {},
          children: [{ type: 'text', value: node.value }],
        }),
      },
    })
    .use(rehypeSanitize)
    .use(rehypeHighlight)
    .use(() => (tree: Root) => {
      visit(tree, 'element', (node) => {
        if (!/^h[1-6]$/.test(node.tagName)) return
        let text = ''
        visit(node, 'text', (child) => {
          text += child.value
        })
        const id = headingId(text)
        node.properties.id = id
        headings.push({ id, text, level: Number(node.tagName[1]) })
      })
    })
    .use(rehypeStringify)
    .process(markdown)
  return { html: String(html), headings }
}
