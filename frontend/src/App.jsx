import { useState, useEffect, useCallback, useRef } from 'react'
import Terminal from './Terminal'
import { apiFetch } from './api'
import './App.css'

const TOKEN_KEY = 'cr_token'

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginGate({ onAuth }) {
  const [value, setValue] = useState('')
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)

  const submit = async () => {
    if (!value.trim()) return
    setBusy(true)
    setErr('')
    try {
      const info = await apiFetch('/api/info', value.trim())
      localStorage.setItem(TOKEN_KEY, value.trim())
      onAuth(value.trim(), info.hostname)
    } catch {
      setErr('invalid token')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">claude<span>-remote</span></div>
        <div className="login-sub">// enter access token to connect</div>
        <input
          className="login-input"
          type="password"
          placeholder="token"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoFocus
          disabled={busy}
        />
        {err && <div className="login-err">{err}</div>}
        <button className="login-btn" onClick={submit} disabled={busy}>
          {busy ? 'connecting…' : 'connect →'}
        </button>
      </div>
    </div>
  )
}

// ── New session form ──────────────────────────────────────────────────────────

function NewSessionForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const [cwd, setCwd]   = useState('~')
  const nameRef = useRef(null)

  useEffect(() => nameRef.current?.focus(), [])

  const submit = () => {
    if (!cwd.trim()) return
    onSubmit({ name: name.trim() || undefined, cwd: cwd.trim() })
  }

  return (
    <div className="new-form">
      <input
        ref={nameRef}
        className="form-input"
        placeholder="name (optional)"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <input
        className="form-input"
        placeholder="cwd"
        value={cwd}
        onChange={e => setCwd(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <div className="form-actions">
        <button className="btn-primary" onClick={submit}>create</button>
        <button className="btn-ghost" onClick={onCancel}>cancel</button>
      </div>
    </div>
  )
}

// ── Session list item ─────────────────────────────────────────────────────────

function SessionItem({ session, active, onSelect, onKill }) {
  const shortCwd = session.cwd.replace(/^\/home\/[^/]+/, '~')

  return (
    <div
      className={`session-item ${active ? 'active' : ''}`}
      onClick={() => onSelect(session)}
    >
      <div className="session-info">
        <div className="session-name">{session.name}</div>
        <div className="session-cwd">{shortCwd}</div>
      </div>
      <button
        className="session-kill"
        title="kill session"
        onClick={e => { e.stopPropagation(); onKill(session.id) }}
      >
        ✕
      </button>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const savedToken   = localStorage.getItem(TOKEN_KEY)
  const [token, setToken]         = useState(savedToken || '')
  const [hostname, setHostname]   = useState('')
  const [authed, setAuthed]       = useState(false)
  const [sessions, setSessions]   = useState([])
  const [active, setActive]       = useState(null)
  const [showForm, setShowForm]   = useState(false)

  // Verify saved token on mount
  useEffect(() => {
    if (!savedToken) return
    apiFetch('/api/info', savedToken)
      .then(info => {
        setAuthed(true)
        setHostname(info.hostname)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken('')
      })
  }, [])

  const handleAuth = (t, h) => {
    setToken(t)
    setHostname(h)
    setAuthed(true)
  }

  const loadSessions = useCallback(() => {
    if (!authed || !token) return
    apiFetch('/api/sessions', token)
      .then(setSessions)
      .catch(console.error)
  }, [authed, token])

  useEffect(() => {
    loadSessions()
    const iv = setInterval(loadSessions, 5000)
    return () => clearInterval(iv)
  }, [loadSessions])

  const createSession = async ({ name, cwd }) => {
    const session = await apiFetch('/api/sessions', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cwd }),
    })
    setSessions(prev => [...prev, session])
    setActive(session)
    setShowForm(false)
  }

  const killSession = async (id) => {
    await apiFetch(`/api/sessions/${id}`, token, { method: 'DELETE' })
    if (active?.id === id) setActive(null)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  if (!authed) return <LoginGate onAuth={handleAuth} />

  return (
    <div className="app">
      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="node-name">{hostname}</div>
          <div className="node-indicator" title="connected" />
        </div>

        <div className="sidebar-section-label">sessions</div>

        <div className="session-list">
          {sessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={active?.id === s.id}
              onSelect={setActive}
              onKill={killSession}
            />
          ))}
          {sessions.length === 0 && (
            <div className="sessions-empty">no active sessions</div>
          )}
        </div>

        <div className="sidebar-footer">
          {showForm ? (
            <NewSessionForm
              onSubmit={createSession}
              onCancel={() => setShowForm(false)}
            />
          ) : (
            <button className="new-session-btn" onClick={() => setShowForm(true)}>
              + new session
            </button>
          )}
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="main">
        {active ? (
          <Terminal key={active.id} session={active} token={token} />
        ) : (
          <div className="empty-state">
            <div className="empty-glyph">_</div>
            <div className="empty-text">select or create a session</div>
            <div className="empty-hint">sessions survive disconnect · tmux keeps them alive</div>
          </div>
        )}
      </main>
    </div>
  )
}
