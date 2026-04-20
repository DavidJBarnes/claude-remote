#!/usr/bin/env bash
# uninstall.sh — remove the claude-remote service and clean build artifacts
# so a subsequent ./install.sh starts from a fresh state.
#
# Removes:
#   - systemd user service + unit file (wipes the baked-in token)
#   - tmux sessions created by the app (names matching cr-<hex>)
#   - backend/.venv, frontend/dist, frontend/node_modules
#
# Preserves:
#   - The project source tree
#   - Custom-named tmux sessions (listed at the end so you can kill them manually)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
SERVICE_NAME="claude-remote"
UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

echo "==> claude-remote uninstall"

# ── 1. systemd service ────────────────────────────────────────────────────────
if systemctl --user list-unit-files "${SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  systemctl --user stop "${SERVICE_NAME}" 2>/dev/null || true
  systemctl --user disable "${SERVICE_NAME}" 2>/dev/null || true
  echo "  stopped and disabled ${SERVICE_NAME}.service"
fi

if [[ -f "$UNIT" ]]; then
  rm -f "$UNIT"
  echo "  removed $UNIT"
fi

systemctl --user daemon-reload
systemctl --user reset-failed "${SERVICE_NAME}" 2>/dev/null || true

# ── 2. tmux sessions created by the app ──────────────────────────────────────
if command -v tmux >/dev/null 2>&1; then
  app_sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^cr-[0-9a-f]{8}$' || true)
  if [[ -n "$app_sessions" ]]; then
    while IFS= read -r s; do
      tmux kill-session -t "$s" 2>/dev/null || true
      echo "  killed tmux session $s"
    done <<< "$app_sessions"
  fi
fi

# ── 3. build artifacts ────────────────────────────────────────────────────────
for path in "$BACKEND_DIR/.venv" "$FRONTEND_DIR/dist" "$FRONTEND_DIR/node_modules"; do
  if [[ -d "$path" ]]; then
    rm -rf "$path"
    echo "  removed $path"
  fi
done

echo ""
echo "✓ claude-remote uninstalled — run ./install.sh to start fresh"

# ── 4. leftover tmux sessions with custom names ───────────────────────────────
if command -v tmux >/dev/null 2>&1; then
  other=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -Ev '^cr-[0-9a-f]{8}$' || true)
  if [[ -n "$other" ]]; then
    echo ""
    echo "  Note: these tmux sessions were not touched (custom names — may not be ours):"
    echo "$other" | sed 's/^/    /'
    echo "  Kill one: tmux kill-session -t <name>"
    echo "  Kill all: tmux kill-server"
  fi
fi
