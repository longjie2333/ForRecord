import { commandsCtx, editorViewCtx, editorViewOptionsCtx, serializerCtx } from '@milkdown/kit/core'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark'
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import type { Node } from '@milkdown/kit/prose/model'
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { blockEdit } from '@milkdown/crepe/feature/block-edit'
import { codeMirror } from '@milkdown/crepe/feature/code-mirror'
import { cursor } from '@milkdown/crepe/feature/cursor'
import { languages } from '@codemirror/language-data'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { minimalSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { createHeadingId } from '../../shared/posts.ts'

export type EditorCommand = 'bold' | 'italic' | 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'undo' | 'redo'
export interface MarkdownEditorHandle {
  getMarkdown: () => string
  command: (command: EditorCommand) => void
  selectAt: (x: number, y: number) => void
  destroy: () => Promise<void>
}

export const createMarkdownEditor = async (
  root: HTMLElement,
  markdown: string,
  editing: boolean,
  onDirty: (dirty: boolean) => void,
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
              if (!current.state.doc.eq(previous.doc)) onDirty(!current.state.doc.eq(initialDoc))
            },
          }
        },
      }),
  )
  const crepe = new CrepeBuilder({ root, defaultValue: markdown }).addFeature(codeMirror, {
    languages,
    searchPlaceholder: '搜索语言',
    copyText: '复制',
    noResultText: '没有匹配语言',
  })
  crepe.setReadonly(!editing)
  if (editing)
    crepe.addFeature(cursor).addFeature(blockEdit, {
      blockHandle: { getOffset: () => 8 },
      textGroup: {
        label: '文本',
        text: { label: '正文' },
        h1: { label: '一级标题' },
        h2: { label: '二级标题' },
        h3: { label: '三级标题' },
        h4: { label: '四级标题' },
        h5: { label: '五级标题' },
        h6: { label: '六级标题' },
        quote: { label: '引用' },
        divider: { label: '分隔线' },
      },
      listGroup: {
        label: '列表',
        bulletList: { label: '无序列表' },
        orderedList: { label: '有序列表' },
        taskList: { label: '任务列表' },
      },
      advancedGroup: {
        label: '插入',
        codeBlock: { label: '代码块' },
        table: { label: '表格' },
        image: null,
        math: null,
      },
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
  if (editing) editor.use(changes)
  try {
    await editor.create()
  } catch (error) {
    await editor.destroy()
    throw error
  }
  initialDoc = editor.action((ctx) => ctx.get(editorViewCtx).state.doc)
  return {
    // Do not normalize stored Markdown just because the editor was opened or its metadata changed.
    getMarkdown: () =>
      editor.action((ctx) => {
        const doc = ctx.get(editorViewCtx).state.doc
        return doc.eq(initialDoc) ? markdown : ctx.get(serializerCtx)(doc)
      }),
    command: (command) =>
      editor.action((ctx) => {
        const commands = ctx.get(commandsCtx)
        const actions = {
          bold: () => commands.call(toggleStrongCommand.key),
          italic: () => commands.call(toggleEmphasisCommand.key),
          heading: () => commands.call(wrapInHeadingCommand.key, 2),
          paragraph: () => commands.call(wrapInHeadingCommand.key, 0),
          list: () => commands.call(wrapInBulletListCommand.key),
          quote: () => commands.call(wrapInBlockquoteCommand.key),
          code: () => commands.call(createCodeBlockCommand.key),
          undo: () => commands.call(undoCommand.key),
          redo: () => commands.call(redoCommand.key),
        }
        actions[command]()
        ctx.get(editorViewCtx).focus()
      }),
    selectAt: (x, y) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const position = view.posAtCoords({ left: x, top: y })
        if (position && view.state.selection.empty) {
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position.pos))))
        }
      }),
    destroy: async () => {
      await editor.destroy()
    },
  }
}
