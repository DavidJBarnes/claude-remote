# claude-remote

Remote PTY terminal in the browser. Connects to `tmux` sessions on your Linux box via WebSocket. Works on any device that has a browser.

## Architecture

```
Browser (xterm.js)  ←──WebSocket──→  FastAPI  ←──PTY──→  tmux
```

Sessions survive WebSocket disconnects — tmux keeps them alive. Reconnect from any device and pick up where you left off.

## Deploy

```bash
# On each node you want to access remotely:
CLAUDE_REMOTE_TOKEN=your-secret-token ./deploy.sh
```

This:
1. Creates a Python venv in `backend/` and installs deps
2. Builds the React frontend into `frontend/dist/`
3. Installs and starts a systemd user service on port 8765

FastAPI serves the compiled frontend as static files — no separate web server needed.

## Uninstall

```bash
./uninstall.sh
```

Stops and removes the systemd user service. Leaves the project directory and any live tmux sessions untouched — list them with `tmux ls`.

Enter your token at the login screen. Token is stored in `localStorage` — you won't be asked again on the same device.

> If you re-deploy with a different token, clear the stale one in devtools first:
> `localStorage.removeItem('cr_token')` — otherwise you'll see "invalid token".

## Development

Run backend and frontend separately with hot-reload:

```bash
# Terminal 1 — backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
CLAUDE_REMOTE_TOKEN=dev uvicorn main:app --reload --port 8765

# Terminal 2 — frontend (proxies /api and /ws to :8765)
cd frontend
npm install
npm run dev
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `CLAUDE_REMOTE_TOKEN` | `changeme` | Shared secret you choose — any string. Don't reuse real credentials; stored plaintext in the systemd unit. |
| `CLAUDE_REMOTE_PORT` | `8765` | Listening port |

## Usage

1. Open the app in your browser
2. Click **+ new session** — give it an optional name and working directory
3. A bash shell opens in a tmux session
4. Type `claude` (or anything) and work as if seated at the terminal
5. Close the tab — session keeps running in tmux
6. Reopen — session appears in the list, click to reattach

## Adding speech-to-text later

The frontend is structured to accept a mic button in the terminal bar that feeds `SpeechRecognition` output directly into xterm as keyboard input. No backend changes needed.
