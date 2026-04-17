#!/usr/bin/env bash
# uninstall.sh — stop and remove the claude-remote systemd user service.
# Leaves the project directory and any live tmux sessions untouched.
set -euo pipefail

SERVICE_NAME="claude-remote"
UNIT="$HOME/.config/systemd/user/${SERVICE_NAME}.service"

echo "==> claude-remote uninstall"

if systemctl --user list-unit-files "${SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SERVICE_NAME}"; then
  systemctl --user stop "${SERVICE_NAME}" 2>/dev/null || true
  systemctl --user disable "${SERVICE_NAME}" 2>/dev/null || true
fi

if [[ -f "$UNIT" ]]; then
  rm -f "$UNIT"
  echo "  removed $UNIT"
fi

systemctl --user daemon-reload
systemctl --user reset-failed "${SERVICE_NAME}" 2>/dev/null || true

echo ""
echo "✓ claude-remote service removed"
echo ""
echo "  Tmux sessions created by the app are still running."
echo "  List them: tmux ls"
echo "  Kill one:  tmux kill-session -t <name>"
echo "  Kill all:  tmux kill-server"
