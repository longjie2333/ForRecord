import { useEffect, useEffectEvent, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
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
import { Field, FieldError, FieldLabel } from '../ui/field.tsx'
import { OTPField, OTPFieldInput } from '../ui/otp-field.tsx'
import { Label } from '../ui/label.tsx'
import { RadioGroup, Radio } from '../ui/radio-group.tsx'
import { Input } from '../ui/input.tsx'
import { Button } from '../ui/button.tsx'
import { DatePicker } from './date-picker.tsx'
import { siteToday } from '../../../shared/posts.ts'
import { tokenModeLabel, tokenModes, tokenModeScoped, type McpToken, type TokenMode } from '../../../shared/tokens.ts'

const OTP_LENGTH = 6

const failure = (cause: unknown) => (cause instanceof Error ? cause.message : '请求失败，请稍后重试')

/** A revoked or expired token is inert: it can be deleted without revoking first. */
const inert = (token: McpToken) => !!token.revokedon || (!!token.expireson && token.expireson < siteToday())

const status = (token: McpToken) =>
  token.revokedon
    ? '已吊销'
    : !token.expireson
      ? '永久有效'
      : token.expireson < siteToday()
        ? '已过期'
        : `有效至 ${token.expireson}`

export const TokenDialog = ({
  open,
  onClose,
  authenticated,
  onAuthenticate,
}: {
  open: boolean
  onClose: () => void
  authenticated: boolean
  onAuthenticate: (code: string) => Promise<void>
}) => {
  const [expired, setExpired] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [tokens, setTokens] = useState<McpToken[]>([])
  const [issued, setIssued] = useState('')
  const [copied, setCopied] = useState(false)
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState<TokenMode>('scoped-read')
  const [dirs, setDirs] = useState('')
  const [expireson, setExpireson] = useState('')
  const [busy, setBusy] = useState(false)
  const signedIn = authenticated && !expired

  // Every token request re-checks the session: the cookie expires on its own, and a 401 has
  // to fall back to the code field instead of failing silently.
  const request = async (input: string, init?: RequestInit) => {
    const response = await fetch(input, init)
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      setExpired(true)
      throw new Error('验证已过期，请重新输入动态码')
    }
    if (!response.ok) throw new Error(payload?.message || '请求失败，请稍后重试')
    return payload
  }

  const load = async () => {
    try {
      setTokens(((await request('/api/tokens')) as McpToken[] | null) ?? [])
    } catch (cause) {
      setError(failure(cause))
    }
  }

  // Opening the dialog is the only trigger, so the latest session is read through an Event.
  const loadOnOpen = useEffectEvent(load)
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the dialog reopens against a live session, so the list has no click of its own
    if (open && signedIn) void loadOnOpen()
  }, [open, signedIn])

  const verify = async () => {
    if (verifying || code.length !== OTP_LENGTH) return
    setVerifying(true)
    setError('')
    try {
      await onAuthenticate(code)
      setExpired(false)
      setCode('')
    } catch (cause) {
      setError(failure(cause))
    } finally {
      setVerifying(false)
    }
  }

  const issue = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = (await request('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          mode,
          dirs: dirs
            .split(/[,，\n]/)
            .map((dir) => dir.trim())
            .filter(Boolean),
          expireson: expireson || null,
        }),
      })) as { token: string }
      setIssued(result.token)
      setCopied(false)
      setLabel('')
      setDirs('')
      setExpireson('')
      await load()
    } catch (cause) {
      setError(failure(cause))
    } finally {
      setBusy(false)
    }
  }

  const change = async (id: number, method: 'PATCH' | 'DELETE') => {
    setError('')
    try {
      await request(`/api/tokens/${id}`, { method })
      await load()
    } catch (cause) {
      setError(failure(cause))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued)
      setCopied(true)
    } catch {
      setError('浏览器不允许写入剪贴板，请手动选中复制')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setCode('')
          setError('')
          setIssued('')
          onClose()
        }
      }}
    >
      <DialogPopup closeProps={{ 'aria-label': '关闭访问令牌', disabled: busy }}>
        <DialogHeader>
          <DialogTitle>访问令牌</DialogTitle>
          {!signedIn && <DialogDescription>输入 6 位动态码以签发和吊销令牌。</DialogDescription>}
        </DialogHeader>
        {signedIn ? (
          <>
            <DialogPanel className="flex flex-col gap-5">
              {issued ? (
                <section className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-xs">只显示这一次，复制后请立即交给客户端。</p>
                  <code className="overflow-x-auto rounded-lg border bg-muted p-3 font-mono text-xs">{issued}</code>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={copy}>
                      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIssued('')}>
                      完成
                    </Button>
                  </div>
                </section>
              ) : (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void issue()
                  }}
                >
                  <div className="flex w-full items-center gap-2">
                    <Field className="flex-1">
                      <FieldLabel htmlFor="token-label">名称</FieldLabel>
                      <Input
                        id="token-label"
                        value={label}
                        maxLength={40}
                        required
                        placeholder="写作助手"
                        onChange={(event) => setLabel(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="token-expiry">有效期</FieldLabel>
                      <div className="flex w-full items-center gap-2">
                        <DatePicker
                          id="token-expiry"
                          value={expireson}
                          from={new Date(`${siteToday()}T12:00:00`)}
                          onChange={setExpireson}
                          collapseOnNarrow={false}
                          className="flex-1"
                        />
                        {expireson && (
                          <Button variant="ghost" onClick={() => setExpireson('')}>
                            清除
                          </Button>
                        )}
                      </div>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel id="token-mode">权限</FieldLabel>
                    <RadioGroup defaultValue={mode} onValueChange={setMode} className="w-full">
                      {tokenModes.map((value) => (
                        <Label
                          key={value}
                          className="flex items-start gap-2 rounded-lg border p-3 hover:bg-accent/50 has-data-checked:border-primary/48 has-data-checked:bg-accent/50"
                        >
                          <Radio value={value} />
                          <p>{tokenModeLabel[value]}</p>
                        </Label>
                      ))}
                    </RadioGroup>
                  </Field>
                  {tokenModeScoped(mode) && (
                    <Field>
                      <FieldLabel htmlFor="token-dirs">目录</FieldLabel>
                      <Input
                        id="token-dirs"
                        value={dirs}
                        required
                        placeholder="智能体, 会话/记忆"
                        onChange={(event) => setDirs(event.target.value)}
                      />
                    </Field>
                  )}
                  <Button type="submit" loading={busy} disabled={!label.trim()}>
                    签发
                  </Button>
                </form>
              )}
              {tokens.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {tokens.map((token) => (
                    <li key={token.id} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{token.label}</span>
                          <span className="shrink-0 text-muted-foreground text-xs">{tokenModeLabel[token.mode]}</span>
                        </div>
                        <p className="truncate text-muted-foreground text-xs">
                          {[
                            token.dirs.length ? token.dirs.join('、') : null,
                            status(token),
                            `最近使用 ${token.lastusedon ?? '从未'}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void change(token.id, inert(token) ? 'DELETE' : 'PATCH')}
                        className="hover:text-destructive-foreground"
                      >
                        {inert(token) ? '删除' : '吊销'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {error && <p className="text-destructive-foreground text-xs">{error}</p>}
            </DialogPanel>
          </>
        ) : (
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void verify()
            }}
          >
            <DialogPanel>
              <Field invalid={!!error}>
                <OTPField
                  aria-label="动态码"
                  length={OTP_LENGTH}
                  required
                  value={code}
                  onValueChange={setCode}
                  onValueComplete={verify}
                  disabled={verifying}
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
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </DialogPanel>
            <DialogFooter variant="bare">
              <DialogClose render={<Button type="button" variant="ghost" disabled={verifying} />}>取消</DialogClose>
              <Button type="submit" loading={verifying} disabled={code.length !== OTP_LENGTH}>
                确认
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  )
}
