/**
 * Builds a WebSocket URL from the current page origin.
 * Token stays in the query string here — browser WebSocket API
 * does not support custom headers.
 */
export function wsUrl(path, token) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${proto}://${host}${path}?token=${encodeURIComponent(token)}`
}

/**
 * Authenticated fetch wrapper — sends token via Authorization header.
 * Throws on non-2xx.
 */
export async function apiFetch(path, token, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}
