import { commandsCtx, editorViewCtx, editorViewOptionsCtx, schemaCtx, serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  addBlockTypeCommand,
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  createCodeBlockCommand,
  headingSchema,
  hrSchema,
  listItemSchema,
  orderedListSchema,
  setBlockTypeCommand,
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import { createTable } from '@milkdown/kit/preset/gfm'
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history'
import { NodeSelection, Plugin, TextSelection, type EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import { $prose, $remark } from '@milkdown/kit/utils'
import type { Node, NodeType } from '@milkdown/kit/prose/model'
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { cursor } from '@milkdown/crepe/feature/cursor'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { latex } from '@milkdown/crepe/feature/latex'
import { listItem } from '@milkdown/crepe/feature/list-item'
import { table } from '@milkdown/crepe/feature/table'
import { languages } from '@codemirror/language-data'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { minimalSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { createHeadingId } from '../../shared/posts.ts'

export type EditorCommand =
  | 'bold'
  | 'italic'
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'code'
  | 'table'
  | 'image'
  | 'link'
  | 'mathInline'
  | 'mathBlock'
  | 'divider'
  | 'undo'
  | 'redo'
export interface SlashContext {
  from: number
  to: number
  query: string
  x: number
  y: number
}
export interface LinkContext {
  href: string
  from: number
  to: number
  x: number
  y: number
  width: number
}
/** Everything the editor reports after a transaction, so the UI can follow the caret. */
export interface EditorReport {
  slash: SlashContext | null
  link: LinkContext | null
}
/** Where a link currently sits in the viewport, so the tooltip can follow it. */
export type AnchorRect = Pick<DOMRect, 'x' | 'y' | 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>
export interface MarkdownEditorHandle {
  getMarkdown: () => string
  command: (command: EditorCommand) => void
  runSlash: (context: SlashContext, command: EditorCommand) => void
  linkContext: () => LinkContext | null
  linkRect: (context: LinkContext) => AnchorRect | null
  setLink: (context: LinkContext, href: string) => void
  removeLink: (context: LinkContext) => void
  selectAt: (x: number, y: number) => void
  focus: () => void
  destroy: () => Promise<void>
}

// A slash typed at the start of a text block opens the command menu under the caret.
const slashContextOf = (view: EditorView): SlashContext | null => {
  const { selection } = view.state
  if (!selection.empty || !selection.$from.parent.isTextblock) return null
  const start = selection.$from.start()
  const match = /^\/(\S*)$/.exec(view.state.doc.textBetween(start, selection.from, '\n', '\n'))
  if (!match) return null
  const { left, bottom } = view.coordsAtPos(selection.from)
  return { from: start, to: selection.from, query: match[1], x: left, y: bottom }
}

// The caret can sit at either edge of a link mark, so look on both sides.
const linkMarkAt = (state: EditorState, position: number) => {
  const type = state.schema.marks.link
  if (!type) return null
  const $pos = state.doc.resolve(position)
  const own = type.isInSet($pos.marks())
  if (own) return { mark: own, position }
  if ($pos.nodeBefore?.isText) {
    const mark = type.isInSet($pos.nodeBefore.marks)
    if (mark) return { mark, position: position - 1 }
  }
  if ($pos.nodeAfter?.isText) {
    const mark = type.isInSet($pos.nodeAfter.marks)
    if (mark) return { mark, position }
  }
  return null
}

const linkContextOf = (view: EditorView): LinkContext | null => {
  const found = linkMarkAt(view.state, view.state.selection.from)
  if (!found) return null
  const $pos = view.state.doc.resolve(found.position)
  if (!$pos.parent.isTextblock) return null
  // Widen the range to every adjacent text node carrying the same link, so the
  // tooltip can rewrite the whole anchor instead of one fragment of it.
  let from = found.position
  let to = found.position
  $pos.parent.forEach((node, offset) => {
    const start = $pos.start() + offset
    const end = start + node.nodeSize
    if (node.isText && found.mark.type.isInSet(node.marks) && start <= found.position && found.position <= end) {
      from = start
      to = end
    }
  })
  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)
  return {
    href: String(found.mark.attrs.href ?? ''),
    from,
    to,
    x: start.left,
    y: start.bottom,
    width: Math.max(0, end.left - start.left),
  }
}

// Images are stored inline: the site has no object storage, and a data URL is the
// only form that survives a reload. Keep the payload small enough for a D1 row.
const MAX_IMAGE_BYTES = 400 * 1024
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
const uploadImage = async (file: File) => {
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片文件')
  if (file.size > MAX_IMAGE_BYTES) {
    window.alert(`图片不能超过 ${MAX_IMAGE_BYTES / 1024} KB，请压缩后再插入。`)
    throw new Error('image too large')
  }
  return readAsDataUrl(file)
}

// Marks are drawn by the site, not Crepe: the same shapes the read-only page shows,
// so a list looks identical before and after the editor takes over.
const BULLET_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`
const UNCHECKED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`
const CHECKED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="3.25" fill="currentColor"/><path d="M8.4 12.1l2.5 2.5 4.7-4.9" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

// The image schema validates title as a string, and an mdast image without one
// carries null, so every `![alt](src)` would be dropped while parsing. Fill it in
// before the node is built; the markdown writer omits an empty title anyway.
// The image block keeps its aspect ratio in `alt`, so when the editor owns images a
// text alt has to move into the caption or it would be overwritten on the next save.
type MdastNode = { type?: string; title?: string | null; alt?: string | null; children?: MdastNode[] }
const imageLabels = (editing: boolean) =>
  $remark('image-labels', () => () => (tree: unknown) => {
    const visit = (node: MdastNode) => {
      if (node.type === 'image' || node.type === 'image-block') {
        node.title ??= ''
        if (editing && node.alt && Number.isNaN(Number(node.alt))) {
          node.title ||= node.alt
          node.alt = ''
        }
      }
      node.children?.forEach(visit)
    }
    visit(tree as MdastNode)
  })

// Compare documents by what the reader can see, not by the state a node view keeps
// for itself: the image block measures its aspect ratio on load, and the trailing
// plugin appends an empty paragraph after the first transaction when the note ends
// with anything but a paragraph. Neither is an edit.
type PmJson = { type?: string; attrs?: Record<string, unknown>; content?: PmJson[]; [key: string]: unknown }
const comparable = (node: PmJson): PmJson => {
  const copy: PmJson = { ...node }
  if (copy.attrs) {
    copy.attrs = { ...copy.attrs }
    if (copy.type === 'image-block') delete copy.attrs.ratio
  }
  if (copy.content) copy.content = copy.content.map(comparable)
  return copy
}
const sameContent = (current: Node, base: Node) => {
  const shape = (doc: Node) => {
    const json = comparable(doc.toJSON() as PmJson)
    const last = json.content?.at(-1)
    if (json.content && json.content.length > 1 && last?.type === 'paragraph' && !last.content?.length)
      json.content.pop()
    return JSON.stringify(json)
  }
  return shape(current) === shape(base)
}

export const createMarkdownEditor = async (
  root: HTMLElement,
  markdown: string,
  editing: boolean,
  onDirty: (dirty: boolean) => void,
  onReport: (report: EditorReport) => void,
): Promise<MarkdownEditorHandle> => {
  let initialDoc: Node
  const anchors = $prose(
    () =>
      new Plugin({
        props: {
          decorations: (state) => {
            const headingId = createHeadingId()
            const decorations: Decoration[] = []
            state.doc.descendants((node, position) => {
              if (node.type.name === 'heading')
                decorations.push(
                  Decoration.node(position, position + node.nodeSize, { id: headingId(node.textContent) }),
                )
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
  )
  const changes = $prose(
    () =>
      new Plugin({
        view: (view) => {
          initialDoc = view.state.doc
          return {
            update: (current, previous) => {
              if (current.state.doc.eq(previous.doc)) return
              onDirty(!(current.state.doc.eq(initialDoc) || sameContent(current.state.doc, initialDoc)))
            },
          }
        },
      }),
  )
  // Report the slash and link state from the editor's own transaction, where the
  // document is current.
  const contextWatch = $prose(
    () =>
      new Plugin({
        view: () => ({
          update: (view) => onReport({ slash: slashContextOf(view), link: linkContextOf(view) }),
        }),
      }),
  )
  const crepe = new CrepeBuilder({ root, defaultValue: markdown }).addFeature(codeMirror, {
    languages,
    searchPlaceholder: '搜索语言',
    copyText: '复制',
    noResultText: '没有匹配语言',
  })
  crepe.setReadonly(!editing)
  // LaTeX renders through KaTeX in both modes, so a formula looks the same whether
  // the note is being read or edited. It needs the code block feature above.
  crepe.addFeature(latex)
  // Lists are drawn by the node view in both modes, otherwise a note would change
  // shape when the reader switches to editing and back. It is inert while read-only.
  crepe.addFeature(listItem, {
    bulletIcon: BULLET_ICON,
    checkBoxCheckedIcon: CHECKED_ICON,
    checkBoxUncheckedIcon: UNCHECKED_ICON,
  })
  // There is no drag handle: the block menu and both insertion entry points are
  // rendered by markdown-editor.tsx. The remaining features are editing only.
  if (editing)
    crepe.addFeature(cursor).addFeature(table).addFeature(imageBlock, {
      onUpload: uploadImage,
      blockUploadButton: '上传图片',
      blockUploadPlaceholderText: '粘贴图片链接',
      blockCaptionPlaceholderText: '填写图片说明',
      blockConfirmButton: '确认',
      inlineUploadButton: '上传',
      inlineUploadPlaceholderText: '粘贴图片链接',
    })
  const editor = crepe.editor
    .config((ctx) => {
      ctx.update(codeBlockConfig.key, (config) => ({
        ...config,
        extensions: [
          minimalSetup,
          keymap.of([indentWithTab]),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ],
      }))
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        attributes: {
          role: editing ? 'textbox' : 'article',
          'aria-label': '文章正文',
          'aria-multiline': String(editing),
          spellcheck: String(editing),
        },
      }))
    })
    .use(anchors)
    .use(imageLabels(editing))
  if (editing) editor.use(changes).use(contextWatch)
  try {
    await editor.create()
  } catch (error) {
    await editor.destroy()
    throw error
  }
  initialDoc = editor.action((ctx) => ctx.get(editorViewCtx).state.doc)
  // A link stops at its last character: typing after it has to fall back to plain
  // text instead of silently extending the anchor.
  if (editing)
    editor.action((ctx) => {
      const link = ctx.get(schemaCtx).marks.link
      if (link) link.spec.inclusive = false
    })
  // Transform the current block without touching its text: the slash range is
  // removed before the command runs, so nothing here clears the user's content.
  const transform = (ctx: Ctx, command: EditorCommand) => {
    const commands = ctx.get(commandsCtx)
    const wrap = (nodeType: NodeType, attrs?: Record<string, unknown>) =>
      commands.call(wrapInBlockTypeCommand.key, attrs ? { nodeType, attrs } : { nodeType })
    const setBlock = (nodeType: NodeType, attrs?: Record<string, unknown>) =>
      commands.call(setBlockTypeCommand.key, attrs ? { nodeType, attrs } : { nodeType })
    const insert = (nodeType: NodeType | Node) => commands.call(addBlockTypeCommand.key, { nodeType })
    const actions: Record<EditorCommand, () => void> = {
      bold: () => commands.call(toggleStrongCommand.key),
      italic: () => commands.call(toggleEmphasisCommand.key),
      paragraph: () => commands.call(wrapInHeadingCommand.key, 0),
      h1: () => setBlock(headingSchema.type(ctx), { level: 1 }),
      h2: () => setBlock(headingSchema.type(ctx), { level: 2 }),
      h3: () => setBlock(headingSchema.type(ctx), { level: 3 }),
      quote: () => wrap(blockquoteSchema.type(ctx)),
      bulletList: () => wrap(bulletListSchema.type(ctx)),
      orderedList: () => wrap(orderedListSchema.type(ctx)),
      taskList: () => wrap(listItemSchema.type(ctx), { checked: false }),
      code: () => commands.call(createCodeBlockCommand.key),
      table: () => insert(createTable(ctx, 3, 3)),
      image: () => {
        const nodeType = ctx.get(schemaCtx).nodes['image-block']
        const node = nodeType?.createAndFill()
        if (node) insert(node)
      },
      // Wraps the selection, or writes placeholder text for an empty one, and lets
      // the tooltip open on the fresh link so the address can be typed right away.
      link: () => {
        const view = ctx.get(editorViewCtx)
        const type = view.state.schema.marks.link
        if (!type) return
        const { from, to, empty } = view.state.selection
        const mark = type.create({ href: 'https://' })
        const tr = view.state.tr
        if (empty) {
          tr.insertText('链接', from)
          tr.addMark(from, from + 2, mark)
          tr.setSelection(TextSelection.create(tr.doc, from + 2))
        } else {
          tr.addMark(from, to, mark)
        }
        view.dispatch(tr)
      },
      // Inline math: wrap whatever is selected, otherwise drop a placeholder node
      // and select it so the KaTeX editor opens on the spot.
      mathInline: () => {
        const view = ctx.get(editorViewCtx)
        const type = ctx.get(schemaCtx).nodes.math_inline
        if (!type) return
        const { from, to, empty } = view.state.selection
        const value = empty ? 'x' : view.state.doc.textBetween(from, to, ' ')
        const tr = view.state.tr.replaceSelectionWith(type.create({ value }))
        view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, from)))
      },
      mathBlock: () => insert(codeBlockSchema.type(ctx).create({ language: 'LaTeX' })),
      divider: () => insert(hrSchema.type(ctx)),
      undo: () => commands.call(undoCommand.key),
      redo: () => commands.call(redoCommand.key),
    }
    actions[command]()
  }
  return {
    // Do not normalize stored Markdown just because the editor was opened or its
    // metadata changed (an image measuring its ratio counts as metadata).
    getMarkdown: () =>
      editor.action((ctx) => {
        const doc = ctx.get(editorViewCtx).state.doc
        const pristine = doc.eq(initialDoc) || sameContent(doc, initialDoc)
        return pristine ? markdown : ctx.get(serializerCtx)(doc)
      }),
    command: (command) =>
      editor.action((ctx) => {
        transform(ctx, command)
        ctx.get(editorViewCtx).focus()
      }),
    runSlash: (context, command) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        if (context.to > context.from) view.dispatch(view.state.tr.delete(context.from, context.to))
        transform(ctx, command)
        view.focus()
      }),
    linkContext: () => editor.action((ctx) => linkContextOf(ctx.get(editorViewCtx))),
    // Reading the caret's coordinates on demand keeps the tooltip glued to the link
    // while the page scrolls.
    linkRect: (context) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        try {
          const start = view.coordsAtPos(context.from)
          const end = view.coordsAtPos(context.to)
          return {
            x: start.left,
            y: start.bottom,
            left: start.left,
            right: end.left,
            top: start.top,
            bottom: start.bottom,
            width: Math.max(0, end.left - start.left),
            height: 0,
          }
        } catch {
          return null
        }
      }),
    setLink: (context, href) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const type = view.state.schema.marks.link
        const value = href.trim()
        if (!type || !value || context.from >= context.to) return
        // No focus() here: the tooltip rewrites the address on every keystroke and
        // has to keep the caret in its input.
        view.dispatch(
          view.state.tr
            .removeMark(context.from, context.to, type)
            .addMark(context.from, context.to, type.create({ href: value })),
        )
      }),
    removeLink: (context) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const type = view.state.schema.marks.link
        if (!type || context.from >= context.to) return
        view.dispatch(view.state.tr.removeMark(context.from, context.to, type))
        view.focus()
      }),
    selectAt: (x, y) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const position = view.posAtCoords({ left: x, top: y })
        if (position && view.state.selection.empty) {
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))))
        }
      }),
    focus: () => editor.action((ctx) => ctx.get(editorViewCtx).focus()),
    destroy: async () => {
      await editor.destroy()
    },
  }
}
