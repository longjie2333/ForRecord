import { lift, setBlockType, wrapIn } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { liftListItem, wrapInList } from 'prosemirror-schema-list'
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { createEditor } from 'typora-web'
import { createHeadingId, headingText } from '../../shared/posts.ts'

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
export interface MarkdownEditorHandle {
  getMarkdown: () => string
  setReadOnly: (readOnly: boolean) => void
  /** Swaps in the Markdown buffer; returns whether source mode is now on. */
  toggleSource: () => boolean
  isSourceMode: () => boolean
  command: (command: EditorCommand) => void
  runSlash: (context: SlashContext, command: EditorCommand) => void
  selectAt: (x: number, y: number) => void
  focus: () => void
  destroy: () => Promise<void>
}

const slashContextOf = (view: EditorView): SlashContext | null => {
  const { selection } = view.state
  if (!selection.empty || !selection.$from.parent.isTextblock) return null
  const start = selection.$from.start()
  // Inline atoms (a checkbox) must read as empty text, not a line break, or the match fails in task lists.
  const match = /^\/(\S*)$/.exec(view.state.doc.textBetween(start, selection.from, '\n', () => ''))
  if (!match) return null
  const { left, bottom } = view.coordsAtPos(selection.from)
  // Only the slash and its query are removed when a command runs, so a leading checkbox survives.
  return { from: selection.from - match[0].length, to: selection.from, query: match[1]!, x: left, y: bottom }
}

// No object storage: images ride inline as data URLs, capped to keep a D1 row small.
const MAX_IMAGE_BYTES = 400 * 1024
const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
const pickImage = () =>
  new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
const uploadImage = async () => {
  const file = await pickImage()
  if (!file) return null
  if (!file.type.startsWith('image/')) throw new Error('仅支持图片文件')
  if (file.size > MAX_IMAGE_BYTES) {
    window.alert(`图片不能超过 ${MAX_IMAGE_BYTES / 1024} KB，请压缩后再插入。`)
    throw new Error('image too large')
  }
  return { url: await readAsDataUrl(file), name: file.name.replace(/\.[^.]+$/, '') }
}

// Formatting edits the delimiters themselves; keeping them is what leaves the saved note byte-identical.
const toggleDelimiters = (view: EditorView, open: string, close = open) => {
  const { state } = view
  const { from, to, empty } = state.selection
  const tr = state.tr
  if (empty) {
    tr.insertText(`${open}${close}`, from)
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + open.length)))
    return
  }
  const selected = state.doc.textBetween(from, to, '\n', '\n')
  const before = state.doc.textBetween(Math.max(0, from - open.length), from, '\n', '\n')
  const after = state.doc.textBetween(to, Math.min(state.doc.content.size, to + close.length), '\n', '\n')
  const wrapped = open.length + close.length
  if (selected.length > wrapped && selected.startsWith(open) && selected.endsWith(close))
    tr.replaceWith(from, to, state.schema.text(selected.slice(open.length, selected.length - close.length)))
  else if (before === open && after === close) {
    tr.delete(to, to + close.length)
    tr.delete(from - open.length, from)
  } else {
    tr.insertText(close, to)
    tr.insertText(open, from)
    tr.setSelection(TextSelection.create(tr.doc, from + open.length, to + open.length))
  }
  view.dispatch(tr)
}

const blockAt = (state: EditorState) => {
  const { $from } = state.selection
  if ($from.depth === 0) return null
  const start = $from.before(1)
  const node = state.doc.nodeAt(start)
  return node ? { start, node } : null
}

const insertedAt = (state: EditorState, name: string) => {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) if ($from.node(depth).type.name === name) return depth
  return null
}

// Empty paragraph is replaced in place, otherwise the block lands after the caret with an
// empty paragraph below. Always top level: from inside a list it lands after that list.
const insertBlock = (view: EditorView, node: PMNode, caret: 'inside' | 'after' = 'after') => {
  const { state } = view
  const current = blockAt(state)
  const paragraph = state.schema.nodes.paragraph.create()
  const tr = state.tr
  let start: number
  if (current && current.node.isTextblock && current.node.content.size === 0) {
    start = current.start
    tr.replaceWith(start, start + current.node.nodeSize, [node, paragraph])
  } else if (current) {
    start = current.start + current.node.nodeSize
    tr.insert(start, [node, paragraph])
  } else {
    start = state.selection.from
    tr.insert(start, [node, paragraph])
  }
  // Textblocks take the caret inside; a rule or table hands it to the paragraph beneath.
  const caretAt = caret === 'inside' && node.isTextblock ? start + 1 : start + node.nodeSize + 1
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(caretAt))).scrollIntoView())
}

const listAt = (state: EditorState) => {
  for (let depth = state.selection.$from.depth; depth > 0; depth--) {
    const name = state.selection.$from.node(depth).type.name
    if (name === 'bullet_list' || name === 'ordered_list') return name
  }
  return null
}

const toggleList = (view: EditorView, name: 'bullet_list' | 'ordered_list') => {
  const { state, dispatch } = view
  const target = state.schema.nodes[name]
  const command = listAt(state) === name ? liftListItem(state.schema.nodes.list_item) : wrapInList(target)
  command(state, dispatch)
}

const listItemPositions = (transaction: Transaction) => {
  const positions: number[] = []
  for (const selection of [transaction.selection.$from, transaction.selection.$to]) {
    for (let depth = selection.depth; depth > 0; depth--) {
      if (selection.node(depth).type.name !== 'list_item') continue
      const paragraph = selection.node(depth).firstChild
      if (paragraph?.type.name === 'paragraph' && paragraph.firstChild?.type.name !== 'task_marker')
        positions.push(selection.before(depth) + 2)
      break
    }
  }
  return [...new Set(positions)]
}

// A task item is a bullet item whose paragraph starts with a checkbox marker.
const toggleTaskList = (view: EditorView) => {
  const { state, dispatch } = view
  const marker = state.schema.nodes.task_marker
  let wrapped: Transaction | null = null
  const wrap = () =>
    wrapInList(state.schema.nodes.bullet_list)(state, (transaction) => {
      wrapped ??= transaction
    })
  wrap()
  const tr = wrapped ?? state.tr
  for (const position of listItemPositions(tr).reverse()) tr.insert(position, marker.create({ checked: false }))
  dispatch(tr.scrollIntoView())
}

const createTable = (schema: EditorState['schema']) => {
  const cell = (header: boolean) => schema.nodes.table_cell.create({ header })
  const row = (header: boolean) => schema.nodes.table_row.create(null, [cell(header), cell(header), cell(header)])
  return schema.nodes.table.create(null, [row(true), row(false), row(false)])
}

/** Markdown carries no heading anchor, so the outline reads ids off the DOM. */
const anchorHeadings = (root: HTMLElement) => {
  const headingId = createHeadingId()
  for (const element of root.querySelectorAll<HTMLElement>('.ProseMirror :is(h1,h2,h3,h4,h5,h6)'))
    element.id = headingId(headingText(element))
}

// Opening a note is not an edit: the parser re-derives marks and may settle a
// trailing empty paragraph, so compare the blocks a reader would see.
const shapeOf = (doc: PMNode) => {
  const blocks: unknown[] = []
  // ProseMirror folds soft breaks into spaces whenever it re-reads the DOM — any
  // click inside a multi-line blockquote — so fold them here too. Code keeps its newlines.
  const visit = (node: PMNode, parent: PMNode | null) => {
    blocks.push(node.type.name, node.attrs)
    if (node.isText) {
      const text = node.text ?? ''
      blocks.push(parent?.type.name === 'code_block' ? text : text.replace(/\n/g, ' '))
    }
  }
  let count = doc.childCount
  while (count > 1) {
    const last = doc.child(count - 1)
    if (last.type.name !== 'paragraph' || last.content.size) break
    count--
  }
  for (let index = 0; index < count; index++)
    doc.child(index).descendants((node, _position, parent) => {
      visit(node, parent)
      return true
    })
  return JSON.stringify(blocks)
}

export const createMarkdownEditor = async ({
  root,
  markdown,
  readOnly: initialReadOnly,
  onDirty,
  onReport,
  onDiagram,
}: {
  root: HTMLElement
  markdown: string
  readOnly: boolean
  onDirty: (dirty: boolean) => void
  onReport: (slash: SlashContext | null) => void
  onDiagram: (svg: SVGSVGElement) => void
}): Promise<MarkdownEditorHandle> => {
  // The library binds Mod-/ (source) and F8/F9 (focus modes) on the window. The page
  // owns source mode, because leaving it rebuilds the view; the focus modes are not ours.
  const swallow = (event: KeyboardEvent) => {
    if (!root.contains(event.target as Node)) return
    const mod = /Mac/.test(navigator.platform) ? event.metaKey : event.ctrlKey
    const sourceKey = event.key === '/' && mod && !event.shiftKey && !event.altKey
    if (!sourceKey && event.key !== 'F8' && event.key !== 'F9') return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (sourceKey) toggleSource()
  }
  window.addEventListener('keydown', swallow, true)

  let pristine = markdown
  let pristineShape = ''
  let dirty = false
  // Only reads the view once it exists, so construction-time change events cannot reach it.
  let record: (next: string) => void = () => undefined
  // The shell has already rendered the note as HTML. The live view appends beside it
  // and the stale copy goes in the same task, so no frame shows both.
  const rendered = [...root.children]
  const editor = createEditor(root, {
    initialContent: markdown,
    // Node views read this at construction to decide whether they need CodeMirror at all.
    editable: !initialReadOnly,
    onChange: (next) => record(next),
  })
  for (const node of rendered) node.remove()
  // Leaving source mode rebuilds the ProseMirror view, so refresh this after every toggle.
  let view = editor.view
  const shapeDirty = (next: string) => (pristineShape ? shapeOf(view.state.doc) !== pristineShape : next !== pristine)
  record = (next) => {
    // Source mode edits the buffer directly; the document is only re-parsed when it ends.
    dirty = editor.isSourceMode() ? next !== pristine : shapeDirty(next)
    onDirty(dirty)
  }
  const settle = () => {
    pristine = editor.getMarkdown()
    pristineShape = shapeOf(view.state.doc)
    dirty = false
    onDirty(false)
  }
  requestAnimationFrame(() => requestAnimationFrame(settle))

  // Reading and writing are the same document: the mode only gates input, so switching never re-parses.
  let readOnly = initialReadOnly
  const applyMode = () => {
    view.setProps({
      editable: () => !readOnly,
      attributes: {
        role: readOnly ? 'article' : 'textbox',
        'aria-label': '文章正文',
        'aria-multiline': String(!readOnly),
        spellcheck: String(!readOnly),
      },
    })
    if (readOnly) anchorHeadings(root)
  }
  applyMode()

  // Source mode is an in-place swap. Coming back re-parses the document into a fresh
  // EditorView without the page's read-only props, so the mode and dirtiness are re-applied.
  const toggleSource = () => {
    if (readOnly) return false
    // Positions do not survive the swap either way.
    selected = null
    onReport(null)
    editor.toggleSource()
    view = editor.view
    if (editor.isSourceMode()) return true
    applyMode()
    dirty = shapeDirty(editor.getMarkdown())
    onDirty(dirty)
    return false
  }

  // The library reports changes as Markdown only, so caret-driven UI asks the view on DOM events.
  const report = () => {
    if (readOnly || editor.isSourceMode()) return
    onReport(slashContextOf(view))
  }
  const onSelectionChange = () => {
    if (view.hasFocus()) report()
  }
  document.addEventListener('selectionchange', onSelectionChange)
  root.addEventListener('keyup', report)
  root.addEventListener('mouseup', report)

  // A right click moves the caret to the pointer, and closing the menu can collapse
  // the selection it was opened for. Remember it and restore it before a command runs.
  let selected: { from: number; to: number } | null = null
  // The view syncs the browser selection on its own schedule: when the state looks
  // collapsed, read the DOM to learn what the user actually selected.
  const domSelection = () => {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || selection.isCollapsed) return null
    const range = selection.getRangeAt(0)
    if (!view.dom.contains(range.commonAncestorContainer)) return null
    const anchor = view.posAtDOM(range.startContainer, range.startOffset)
    const head = view.posAtDOM(range.endContainer, range.endOffset)
    return anchor === head ? null : { from: Math.min(anchor, head), to: Math.max(anchor, head) }
  }
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 2) return
    const { selection } = view.state
    selected = selection.empty ? domSelection() : { from: selection.from, to: selection.to }
  }
  const onKeyDown = () => {
    selected = null
  }
  root.addEventListener('mousedown', onMouseDown, true)
  root.addEventListener('keydown', onKeyDown, true)

  // To a reader the diagram is a picture; to an editor the click expands the fence. Capture
  // phase, because the node view binds the same click on the panel.
  const openDiagram = (event: MouseEvent) => {
    if (!readOnly) return
    const svg = event.target instanceof Element ? event.target.closest('.diagram-panel')?.querySelector('svg') : null
    if (!svg) return
    event.preventDefault()
    event.stopPropagation()
    onDiagram(svg)
  }
  root.addEventListener('click', openDiagram, true)

  const run = (command: EditorCommand) => {
    if (editor.isSourceMode()) return
    if (selected && view.state.selection.empty)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected.from, selected.to)))
    selected = null
    const { state, dispatch } = view
    const { paragraph, heading, blockquote, code_block, math_block, horizontal_rule } = state.schema.nodes
    const actions: Record<EditorCommand, () => void> = {
      bold: () => toggleDelimiters(view, '**'),
      italic: () => toggleDelimiters(view, '*'),
      paragraph: () => setBlockType(paragraph)(state, dispatch),
      h1: () => setBlockType(heading, { level: 1, style: 'atx' })(state, dispatch),
      h2: () => setBlockType(heading, { level: 2, style: 'atx' })(state, dispatch),
      h3: () => setBlockType(heading, { level: 3, style: 'atx' })(state, dispatch),
      // Inside a quote the command removes it instead of nesting a second one.
      quote: () => (insertedAt(state, 'blockquote') ? lift(state, dispatch) : wrapIn(blockquote)(state, dispatch)),
      bulletList: () => toggleList(view, 'bullet_list'),
      orderedList: () => toggleList(view, 'ordered_list'),
      taskList: () => toggleTaskList(view),
      code: () => insertBlock(view, code_block.create({ lang: '' }), 'inside'),
      table: () => insertBlock(view, createTable(state.schema)),
      image: () => {
        void (async () => {
          const image = await uploadImage().catch(() => null)
          if (!image) return
          const { from, to } = view.state.selection
          view.dispatch(view.state.tr.insertText(`![${image.name}](${image.url})`, from, to).scrollIntoView())
        })()
      },
      // Leaves the placeholder address selected, so typing replaces the address, not the anchor.
      link: () => {
        const { from, to, empty } = view.state.selection
        const text = empty ? '链接' : view.state.doc.textBetween(from, to, ' ')
        const href = 'https://'
        const tr = view.state.tr.insertText(`[${text}](${href})`, from, to)
        const hrefFrom = from + text.length + 3
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, hrefFrom, hrefFrom + href.length)))
      },
      mathInline: () => {
        const { from, to, empty } = view.state.selection
        const value = empty ? 'x' : view.state.doc.textBetween(from, to, ' ')
        const tr = view.state.tr.insertText(`$${value}$`, from, to)
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + value.length)))
      },
      mathBlock: () => insertBlock(view, math_block.create(), 'inside'),
      divider: () => insertBlock(view, horizontal_rule.create()),
      undo: () => undo(state, dispatch),
      redo: () => redo(state, dispatch),
    }
    actions[command]()
  }

  return {
    // Never normalize stored Markdown just because the editor opened: the original
    // text is what gets written back until something actually changes.
    getMarkdown: () => (dirty ? editor.getMarkdown() : markdown),
    // Reading has no source view, so leaving edit mode ends it first.
    setReadOnly: (value) => {
      if (value && editor.isSourceMode()) toggleSource()
      readOnly = value
      selected = null
      applyMode()
      if (readOnly) onReport(null)
    },
    toggleSource,
    isSourceMode: () => editor.isSourceMode(),
    command: (command) => {
      run(command)
      view.focus()
      report()
    },
    runSlash: (context, command) => {
      if (context.to > context.from) view.dispatch(view.state.tr.delete(context.from, context.to))
      run(command)
      view.focus()
      report()
    },
    selectAt: (x, y) => {
      const position = view.posAtCoords({ left: x, top: y })
      if (!position) return
      // A press inside the remembered selection keeps it, so the menu still applies to every pick.
      if (selected && position.pos >= selected.from && position.pos <= selected.to) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected.from, selected.to)))
        return
      }
      selected = null
      if (view.state.selection.empty)
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))))
    },
    focus: () => view.focus(),
    destroy: async () => {
      // Tearing down from source mode would leave the CodeMirror buffer alive.
      if (editor.isSourceMode()) editor.toggleSource()
      document.removeEventListener('selectionchange', onSelectionChange)
      root.removeEventListener('keyup', report)
      root.removeEventListener('mouseup', report)
      root.removeEventListener('mousedown', onMouseDown, true)
      root.removeEventListener('keydown', onKeyDown, true)
      root.removeEventListener('click', openDiagram, true)
      window.removeEventListener('keydown', swallow, true)
      editor.destroy()
    },
  }
}
