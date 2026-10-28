import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog.tsx'
import { Button } from '../ui/button.tsx'
import { CODE_LENGTH, CodeField } from './code-field.tsx'

export const SaveDialog = ({
  mode,
  authenticated,
  onClose,
  onSubmit,
}: {
  mode: 'save' | 'delete' | null
  authenticated: boolean
  onClose: () => void
  onSubmit: (code?: string) => Promise<void>
}) => {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const complete = authenticated || code.length === CODE_LENGTH
  const submit = async () => {
    if (busy || !complete) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(authenticated ? undefined : code)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请求失败，请稍后重试')
    } finally {
      setBusy(false)
      setCode('')
    }
  }
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setCode('')
          setError('')
          onClose()
        }
      }}
    >
      <DialogPopup closeProps={{ 'aria-label': '关闭验证', disabled: busy }}>
        <DialogHeader>
          <DialogTitle>{mode === 'delete' ? '删除这篇笔记？' : '保存这篇笔记'}</DialogTitle>
          <DialogDescription>
            {mode === 'delete' ? '删除后无法恢复，请确认是否删除这篇笔记。' : '请输入 6 位动态码。'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogPanel>
            {authenticated ? (
              error && (
                <p role="alert" className="text-destructive-foreground text-xs">
                  {error}
                </p>
              )
            ) : (
              <CodeField value={code} error={error} disabled={busy} onChange={setCode} onComplete={submit} />
            )}
          </DialogPanel>
          <DialogFooter variant="bare">
            <DialogClose render={<Button type="button" variant="ghost" disabled={busy} />}>取消</DialogClose>
            <Button
              type="submit"
              variant={mode === 'delete' ? 'destructive' : 'default'}
              loading={busy}
              disabled={!complete}
            >
              {mode === 'delete' ? '确认删除' : '确认保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
