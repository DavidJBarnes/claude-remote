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

function NewSessionForm({ onSubmit, onCancel, token }) {
  const [name, setName]       = useState('')
  const [cwd, setCwd]         = useState('~/')
  const [matches, setMatches] = useState([])
  const [sel, setSel]         = useState(0)
  const [open, setOpen]       = useState(false)
  const nameRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => nameRef.current?.focus(), [])

  // Fetch completions (debounced) whenever cwd changes while dropdown is open.
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => {
      apiFetch(`/api/fs/complete?prefix=${encodeURIComponent(cwd)}`, token)
        .then(r => { setMatches(r.matches || []); setSel(0) })
        .catch(() => setMatches([]))
    }, 80)
    return () => clearTimeout(id)
  }, [cwd, open, token])

  // Keep highlighted suggestion scrolled into view.
  useEffect(() => {
    const el = listRef.current?.children[sel]
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const submit = () => {
    if (!cwd.trim()) return
    onSubmit({ name: name.trim() || undefined, cwd: cwd.trim() })
  }

  const accept = (m) => setCwd(m)

  const onCwdKey = (e) => {
    if (!open || matches.length === 0) {
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') onCancel()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel(i => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(i => (i - 1 + matches.length) % matches.length)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      accept(matches[sel])
    } else if (e.key === 'Enter') {
      submit()
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
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
      <div className="cwd-wrap">
        <input
          className="form-input"
          placeholder="cwd"
          value={cwd}
          onChange={e => { setCwd(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onCwdKey}
          spellCheck={false}
          autoComplete="off"
        />
        {open && matches.length > 0 && (
          <ul className="cwd-suggestions" ref={listRef}>
            {matches.map((m, i) => (
              <li
                key={m}
                className={i === sel ? 'active' : ''}
                onMouseDown={e => { e.preventDefault(); accept(m) }}
                onMouseEnter={() => setSel(i)}
              >
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
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
              token={token}
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
