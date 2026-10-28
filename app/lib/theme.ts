import { useEffect, useState } from 'react'
import type { ThemeMode } from '../../shared/posts.ts'

// The order a click walks. A pinned choice is remembered in a cookie; the system
// setting is the absence of that cookie, so returning to it deletes one.
const order: ThemeMode[] = ['system', 'light', 'dark']
const nextMode = (mode: ThemeMode): ThemeMode => order[(order.indexOf(mode) + 1) % order.length]

// Two attributes carry the resolved value: `.dark` selects the site's tokens (theme.css),
// `data-appearance` is the switch typora-web reads for its chrome and code colours.
const setAppearance = (dark: boolean) => {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.dataset.appearance = dark ? 'dark' : 'light'
}

const remember = (mode: ThemeMode) => {
  document.cookie =
    mode === 'system'
      ? 'for-record-theme=; Path=/; Max-Age=0; SameSite=Lax'
      : `for-record-theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`
}

// A pinned theme is already in the markup, so only `system` needs this: it runs in the
// head, where only the browser knows the setting, and repeats `setAppearance` to stay
// a string the parser can execute.
export const themeBootstrap = `const r=document.documentElement,d=matchMedia('(prefers-color-scheme: dark)').matches;r.classList.toggle('dark',d);r.dataset.appearance=d?'dark':'light'`

export const useTheme = (initial: ThemeMode) => {
  const [mode, setMode] = useState(initial)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setAppearance(mode === 'dark' || (mode === 'system' && media.matches))
    sync()
    if (mode !== 'system') return
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [mode])
  return [
    mode,
    () => {
      const next = nextMode(mode)
      remember(next)
      setMode(next)
    },
  ] as const
}
