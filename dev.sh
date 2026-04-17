#!/usr/bin/env bash
# dev.sh — start backend + frontend with hot-reload
# Usage: CLAUDE_REMOTE_TOKEN=dev ./dev.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN="${CLAUDE_REMOTE_TOKEN:-dev}"

# Set up venv if needed
cd "$SCRIPT_DIR/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  source .venv/bin/activate
  pip install --quiet -r requirements.txt
  deactivate
fi

# npm install if needed
cd "$SCRIPT_DIR/frontend"
if [ ! -d node_modules ]; then
  npm install --silent
fi

echo "Starting claude-remote in dev mode"
echo "  Backend  → http://localhost:8765"
echo "  Frontend → http://localhost:5173  (proxies /api + /ws)"
echo "  Token: $TOKEN"
echo ""

# Run both; kill both on Ctrl-C
trap 'kill 0' EXIT

CLAUDE_REMOTE_TOKEN="$TOKEN" \
  "$SCRIPT_DIR/backend/.venv/bin/uvicorn" main:app \
  --app-dir "$SCRIPT_DIR/backend" \
  --reload --port 8765 &

cd "$SCRIPT_DIR/frontend" && npm run dev &

wait
