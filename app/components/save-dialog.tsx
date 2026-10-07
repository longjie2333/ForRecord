import {useState} from 'react'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from './ui/dialog.tsx'
import {Field, FieldError} from './ui/field.tsx'
import { OTPField, OTPFieldInput } from './ui/otp-field.tsx'
import { Button } from './ui/button.tsx'

const OTP_LENGTH = 6;

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
  const submit = async () => {
    if (busy || (!authenticated && code.length !== 6)) return
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
            {mode === 'delete'
              ? '删除后无法恢复，请确认是否删除这篇笔记。'
              : '请输入 6 位动态码。'}
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}>
          <DialogPanel>
            {!authenticated && (
              <Field invalid={!!error}>
                <OTPField
                  aria-label="动态码"
                  length={OTP_LENGTH}
                  required
                  value={code}
                  onValueChange={setCode}
                  onValueComplete={submit}
                  disabled={busy}
                  aria-invalid={!!error}
                >
                  {Array.from({ length: OTP_LENGTH }, (_, index) => (
                    <OTPFieldInput
                      key={index}
                      autoFocus={index === 0}
                      aria-label={index === 0 ? undefined : `动态码第 ${index + 1} 位`}
                    />
                  ))}
                </OTPField>
                {error && (<FieldError>{error}</FieldError>)}
              </Field>
            )}
          </DialogPanel>
          <DialogFooter variant="bare">
            <DialogClose render={<Button type="button" variant="ghost" disabled={busy} />}>取消</DialogClose>
            <Button
              type="submit"
              variant={mode === 'delete' ? 'destructive' : 'default'}
              loading={busy}
              disabled={!authenticated && code.length !== 6}
            >
              {mode === 'delete' ? '确认删除' : '确认保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
