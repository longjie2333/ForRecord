import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './server',
  preset: 'cloudflare_module',
  compatibilityDate: '2026-10-01',
  devServer: { runner: 'node-worker' },
  // MCP clients run anywhere, browsers included, and authenticate with a bearer header,
  // never a cookie: any origin may call it, and a preflight is answered before the handler.
  routeRules: { '/mcp': { cors: true } },
  // React is rendered with SSR, so RSC's "use client" directives are intentionally unused.
  rolldownConfig: { checks: { moduleLevelDirective: false } },
})
