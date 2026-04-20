"""tmux session lifecycle management."""
import logging
import os
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Session:
    id: str
    tmux_name: str
    created_at: datetime
    cwd: str


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def create(self, name: Optional[str] = None, cwd: str = "~") -> Session:
        """Spawn a new detached tmux session and track it."""
        session_id = uuid.uuid4().hex[:8]
        tmux_name = name if name else f"cr-{session_id}"

        expanded = os.path.expanduser(cwd)

        subprocess.run(
            ["tmux", "new-session", "-d", "-s", tmux_name, "-c", expanded],
            check=True,
        )
        subprocess.run(
            ["tmux", "set-option", "-t", tmux_name, "mouse", "on"],
            check=True,
        )

        session = Session(
            id=session_id,
            tmux_name=tmux_name,
            created_at=datetime.now(),
            cwd=expanded,
        )
        self._sessions[session_id] = session
        logger.info("Created session %s → tmux:%s", session_id, tmux_name)
        return session

    def sync_and_list(self) -> list[Session]:
        """Return tracked sessions, pruning any whose tmux session is gone."""
        try:
            result = subprocess.run(
                ["tmux", "list-sessions", "-F", "#{session_name}"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                live = set(result.stdout.strip().splitlines())
            else:
                live = set()

            dead = [sid for sid, s in self._sessions.items() if s.tmux_name not in live]
            for sid in dead:
                del self._sessions[sid]
                logger.info("Pruned dead session %s", sid)
        except Exception as exc:
            logger.warning("tmux sync failed: %s", exc)

        return list(self._sessions.values())

    def get(self, session_id: str) -> Optional[Session]:
        return self._sessions.get(session_id)

    def delete(self, session_id: str) -> bool:
        session = self._sessions.get(session_id)
        if not session:
            return False
        try:
            subprocess.run(
                ["tmux", "kill-session", "-t", session.tmux_name],
                check=True,
            )
        except subprocess.CalledProcessError:
            pass  # already dead
        del self._sessions[session_id]
        logger.info("Deleted session %s", session_id)
        return True
