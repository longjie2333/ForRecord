// Public surface of the library, transcribed from src/editor-api.ts at v0.9.1.
// The upstream package publishes no declarations, and this vendor copy is a
// prebuilt bundle, so the controller's shape is restated here.
import type { EditorView } from 'prosemirror-view'

export interface EditorOptions {
  /** Initial markdown the editor opens with. Defaults to empty. */
  initialContent?: string
  /** Fired on every document-changing transaction; arg is the current markdown. Raw, no debounce. */
  onChange?: (md: string) => void
  /** Fired when the editor surface (rendered or source) gains focus. */
  onFocus?: () => void
  /** Fired when the editor surface loses focus. */
  onBlur?: () => void
  /**
   * Whether the document opens editable. Defaults to true. A read-only note keeps
   * it false so its fenced blocks never build a CodeMirror, and the editors appear
   * only when the note is opened for writing.
   */
  editable?: boolean
}

export interface FileResult {
  status: 'opened' | 'saved' | 'downloaded' | 'created' | 'picked' | 'cancelled' | 'error'
  name?: string
  message?: string
}

export interface Editor {
  /** Current markdown — renders source from the live PM doc, or returns the textarea contents in source mode. */
  getMarkdown(): string
  /** Replace the document. Works in either rendered or source mode. */
  setMarkdown(md: string): void
  /** Flip between rendered and raw-source views. */
  toggleSource(): void
  isSourceMode(): boolean
  toggleFocusMode(): void
  setFocusMode(enabled: boolean): void
  isFocusMode(): boolean
  toggleTypewriterMode(): void
  setTypewriterMode(enabled: boolean): void
  isTypewriterMode(): boolean
  focus(): void
  destroy(): void
  /** Escape hatch: the live ProseMirror view. Advanced; no API stability promised on this access. */
  readonly view: EditorView
}

export function createEditor(host: HTMLElement, options?: EditorOptions): Editor
