/**
 * Builds a URL with the auth token as a query param.
 * All API paths are relative so the app works regardless of host.
 */
export function apiUrl(path, token) {
  return `${path}?token=${encodeURIComponent(token)}`
}

/**
 * Builds a WebSocket URL from the current page origin.
 */
export function wsUrl(path, token) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${proto}://${host}${path}?token=${encodeURIComponent(token)}`
}

/**
 * Authenticated fetch wrapper — throws on non-2xx.
 */
export async function apiFetch(path, token, options = {}) {
  const res = await fetch(apiUrl(path, token), options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}
