import { useEffect, useState } from 'react'
import type { ThemeMode } from '../../shared/posts.ts'

// The order a click walks: the visitor's own setting, then the two choices that
// pin it. A pinned choice is remembered in a cookie; the system setting is the
// absence of that cookie, so going back to it deletes one.
const order: ThemeMode[] = ['system', 'light', 'dark']
const nextMode = (mode: ThemeMode): ThemeMode => order[(order.indexOf(mode) + 1) % order.length]

// Two attributes carry the resolved value to the stylesheets: `.dark` selects the
// site's dark tokens (theme.css), while `data-appearance` is the switch typora-web
// reads for its own chrome and its code colours.
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

// A page that opens on the system theme paints before hydration, when only the
// browser knows that setting, so the head runs this to keep the first paint from
// drifting to the other theme. It repeats `setAppearance` because it has to stay a
// string the parser can execute; a pinned theme needs none of it, since the server
// already wrote both attributes.
export const themeBootstrap = `const r=document.documentElement,d=matchMedia('(prefers-color-scheme: dark)').matches;r.classList.toggle('dark',d);r.dataset.appearance=d?'dark':'light'`

export const useTheme = (initial: ThemeMode) => {
  const [mode, setMode] = useState(initial)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setAppearance(mode === 'dark' || (mode === 'system' && media.matches))
    sync()
    // Only the system mode listens: a pinned choice keeps ignoring the OS.
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
