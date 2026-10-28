/// <reference types="nitro/vite/types" />

// The package ships no declarations; this is the surface the server renderer uses.
declare module 'markdown-it-emoji' {
  import type { PluginSimple } from 'markdown-it'
  export const full: PluginSimple
}
