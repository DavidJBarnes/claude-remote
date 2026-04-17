import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { wsUrl } from './api'

const TERM_THEME = {
  background: '#090C12',
  foreground: '#C8D8F0',
  cursor: '#F0A030',
  cursorAccent: '#090C12',
  selectionBackground: 'rgba(240,160,48,0.25)',
  black: '#1C2535',
  red: '#D04848',
  green: '#30C890',
  yellow: '#F0A030',
  blue: '#4080D0',
  magenta: '#A050D0',
  cyan: '#30B0C0',
  white: '#C8D8F0',
  brightBlack: '#4A5870',
  brightRed: '#E06060',
  brightGreen: '#50E0A0',
  brightYellow: '#F8B840',
  brightBlue: '#60A0F0',
  brightMagenta: '#C070F0',
  brightCyan: '#50D0E0',
  brightWhite: '#E8F0FF',
}

const STATUS_COLOR = {
  connecting:   '#F0A030',
  connected:    '#30C890',
  disconnected: '#D04848',
  error:        '#D04848',
  exited:       '#4A5870',
}

export default function Terminal({ session, token }) {
  const containerRef = useRef(null)
  const termRef      = useRef(null)
  const fitRef       = useRef(null)
  const wsRef        = useRef(null)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── xterm instance ────────────────────────────────────────────────────
    const term = new XTerm({
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.45,
      cursorStyle: 'block',
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 10000,
      macOptionIsMeta: true,
    })

    const fitAddon   = new FitAddon()
    const linksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(container)
    // Small delay so the container has its final dimensions
    requestAnimationFrame(() => fitAddon.fit())

    termRef.current = term
    fitRef.current  = fitAddon

    // ── WebSocket ─────────────────────────────────────────────────────────
    const url = wsUrl(`/ws/sessions/${session.id}`, token)
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      const { cols, rows } = term
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'output') {
        const bytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))
        term.write(bytes)
      } else if (msg.type === 'exit') {
        setStatus('exited')
        term.write('\r\n\x1b[33m[session ended — tmux session still alive]\x1b[0m\r\n')
      }
    }

    ws.onerror = () => setStatus('error')
    ws.onclose = () => setStatus(prev => prev === 'exited' ? 'exited' : 'disconnected')

    // ── terminal → ws ─────────────────────────────────────────────────────
    term.onData(data => {
      if (ws.readyState !== WebSocket.OPEN) return
      // Encode raw input string to base64 safely
      let b64
      try {
        b64 = btoa(data)
      } catch {
        const bytes = new TextEncoder().encode(data)
        let binary = ''
        bytes.forEach(b => (binary += String.fromCharCode(b)))
        b64 = btoa(binary)
      }
      ws.send(JSON.stringify({ type: 'input', data: b64 }))
    })

    // ── resize ────────────────────────────────────────────────────────────
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        return
      }
      const { cols, rows } = term
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      ws.close()
      term.dispose()
    }
  }, [session.id, token])

  const statusColor = STATUS_COLOR[status] ?? '#4A5870'

  return (
    <div className="terminal-wrap">
      <div className="terminal-bar">
        <div className="terminal-bar-left">
          <span className="terminal-session-name">{session.name}</span>
          <span className="terminal-cwd">{session.cwd}</span>
        </div>
        <span className="terminal-status" style={{ color: statusColor }}>
          ● {status}
        </span>
      </div>
      <div className="terminal-container" ref={containerRef} />
    </div>
  )
}
