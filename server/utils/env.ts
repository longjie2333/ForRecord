import { useNitroHooks } from 'nitro/app'
import type { H3Event } from 'nitro'

interface Bindings {
  DB: D1Database
  SECRET: string
  JWT_SECRET: string
  SITE_NAME: string
  SITE_ICO: string
  SITE_AUTHOR: string
  SITE_KEYWORDS: string
  SITE_DESCRIPTION: string
}

// Vite runs in Node for portable HMR; Wrangler supplies the real local D1 binding.
// The dev branch is removed from the Worker build.
const platform = import.meta.env.DEV
  ? await (
      await import('wrangler')
    ).getPlatformProxy<Bindings>({
      configPath: 'wrangler.jsonc',
    })
  : null
if (platform) useNitroHooks().hook('close', platform.dispose)

export const getBindings = (event: H3Event): Bindings =>
  import.meta.env.DEV ? platform!.env : (event.req.runtime!.cloudflare!.env as unknown as Bindings)
