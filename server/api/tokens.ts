import { defineHandler } from 'nitro'
import { requireSession } from '../utils/auth.ts'
import { getBindings } from '../utils/env.ts'
import { json, readJson, requireMethod } from '../utils/http.ts'
import { createToken, listTokens } from '../utils/tokens.ts'

// Token management is web-only: an MCP tool can never mint or inspect a token.
export default defineHandler(async (event) => {
  const method = requireMethod(event, ['GET', 'POST'])
  const { DB, JWT_SECRET } = getBindings(event)
  await requireSession(event, JWT_SECRET)
  if (method === 'GET') return json(await listTokens(DB))
  return json(await createToken(DB, await readJson(event)), 201)
})
