export const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: { id: string; email: string | null; displayName: string }
}

export interface RuntimeSession {
  id: string
  stageId: string
  state: string
  expiresAt: string
  servers: { id: string; label: string }[]
}

const authKey = 'btf-auth-session'

export function getStoredAuth(): AuthSession | null {
  try {
    return JSON.parse(localStorage.getItem(authKey) ?? 'null')
  } catch {
    return null
  }
}

export function storeAuth(session: AuthSession) {
  localStorage.setItem(authKey, JSON.stringify(session))
  window.dispatchEvent(new CustomEvent('btf-auth-change'))
  return session
}

async function requestAuth(path: string, body?: unknown) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`Authentication failed (${response.status})`)
  return storeAuth(await response.json() as AuthSession)
}

export async function exchangeGoogleCredential(credential: string) {
  if (!apiUrl) throw new Error('VITE_API_URL is not configured')
  return requestAuth('/api/v1/auth/google', { credential })
}

export async function ensureAuth() {
  const stored = getStoredAuth()
  if (stored?.accessToken) return stored
  if (!apiUrl) return null
  return requestAuth('/api/v1/auth/demo')
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  let auth = await ensureAuth()
  if (!auth) throw new Error('Live API is not configured')
  let response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      authorization: `Bearer ${auth.accessToken}`,
      ...init.headers,
    },
  })
  if (response.status === 401 && auth.refreshToken) {
    auth = await requestAuth('/api/v1/auth/refresh', { refreshToken: auth.refreshToken })
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        authorization: `Bearer ${auth.accessToken}`,
        ...init.headers,
      },
    })
  }
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`)
  return { response, auth }
}

export async function createRuntimeSession(stageId: string) {
  const { response, auth } = await authorizedFetch('/api/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({ stageId }),
  })
  return { session: await response.json() as RuntimeSession, auth }
}

export async function deleteRuntimeSession(sessionId: string) {
  if (!apiUrl) return
  await authorizedFetch(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined)
}

export function terminalSocketUrl(sessionId: string, serverId: string) {
  const url = new URL(apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `/ws/sessions/${sessionId}/terminal`
  url.searchParams.set('server', serverId)
  return url.toString()
}
