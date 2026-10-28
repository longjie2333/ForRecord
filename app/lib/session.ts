import { useEffect, useState } from 'react'
import { requestJson } from './api.ts'

/**
 * The browser's view of the one-hour write session. Every dialog reads and ends it here, so
 * a 401 seen while saving and one seen while managing tokens are the same state.
 */
export const useSession = (initialExpiresAt: number) => {
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt)
  const authenticated = expiresAt > 0
  useEffect(() => {
    if (!expiresAt) return
    const timer = window.setTimeout(() => setExpiresAt(0), Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [expiresAt])
  const authenticate = async (code: string) => {
    const session = await requestJson<{ expiresAt: number }>('/api/session', {
      method: 'POST',
      headers: { Code: code },
    })
    setExpiresAt(session.expiresAt)
  }
  const expire = () => setExpiresAt(0)
  return { authenticated, authenticate, expire }
}

export type Session = ReturnType<typeof useSession>
