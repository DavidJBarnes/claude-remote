#!/usr/bin/env bash
# deploy.sh — install, build, and install systemd service for claude-remote
# Run as the user who owns the project (not root).
# Usage:  CLAUDE_REMOTE_TOKEN=mysecret ./deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
SERVICE_NAME="claude-remote"
PORT="${CLAUDE_REMOTE_PORT:-8765}"
TOKEN="${CLAUDE_REMOTE_TOKEN:-changeme}"

echo "==> claude-remote deploy"
echo "    dir:   $SCRIPT_DIR"
echo "    port:  $PORT"
echo ""

# ── 1. Python venv ────────────────────────────────────────────────────────────
echo "[1/4] Setting up Python venv…"
cd "$BACKEND_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
deactivate

# ── 2. Node / npm ─────────────────────────────────────────────────────────────
echo "[2/4] Installing frontend dependencies…"
cd "$FRONTEND_DIR"
npm install --silent

# ── 3. Build frontend ─────────────────────────────────────────────────────────
echo "[3/4] Building frontend…"
npm run build

echo "      → dist written to $FRONTEND_DIR/dist"

# ── 4. systemd user service ───────────────────────────────────────────────────
echo "[4/4] Installing systemd user service…"

mkdir -p "$HOME/.config/systemd/user"

cat > "$HOME/.config/systemd/user/${SERVICE_NAME}.service" << EOF
[Unit]
Description=claude-remote PTY server
After=network.target

[Service]
Type=simple
WorkingDirectory=${BACKEND_DIR}
Environment="CLAUDE_REMOTE_TOKEN=${TOKEN}"
Environment="CLAUDE_REMOTE_PORT=${PORT}"
ExecStart=${BACKEND_DIR}/.venv/bin/uvicorn main:app --host 0.0.0.0 --port ${PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "${SERVICE_NAME}"
systemctl --user restart "${SERVICE_NAME}"

echo ""
echo "✓ claude-remote running on port $PORT"
echo "  http://$(hostname).zero:$PORT"
echo ""
echo "  Token is set in the systemd unit."
echo "  To change it: edit ~/.config/systemd/user/${SERVICE_NAME}.service"
echo "  then: systemctl --user daemon-reload && systemctl --user restart ${SERVICE_NAME}"
echo ""
echo "  Logs: journalctl --user -u ${SERVICE_NAME} -f"
