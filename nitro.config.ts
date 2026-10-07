import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './server',
  preset: 'cloudflare_module',
  compatibilityDate: '2026-10-01',
  devServer: { runner: 'node-worker' },
  // React is rendered with SSR, so RSC's "use client" directives are intentionally unused.
  rolldownConfig: { checks: { moduleLevelDirective: false } },
})
