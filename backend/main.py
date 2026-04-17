"""claude-remote: FastAPI backend.

Serves the compiled React frontend as static files and exposes:
  GET  /api/info
  POST /api/sessions
  GET  /api/sessions
  DELETE /api/sessions/{id}
  WS   /ws/sessions/{id}
"""
import asyncio
import base64
import json
import logging
import os
import secrets
import socket
from pathlib import Path
from typing import Optional

import ptyprocess
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from sessions import SessionManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

AUTH_TOKEN: str = os.environ.get("CLAUDE_REMOTE_TOKEN", "changeme")
HOSTNAME: str = socket.gethostname()

session_manager = SessionManager()

app = FastAPI(title="claude-remote")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── auth ──────────────────────────────────────────────────────────────────────

def check_token(token: str = Query(...)) -> str:
    if not secrets.compare_digest(token, AUTH_TOKEN):
        raise HTTPException(status_code=403, detail="Forbidden")
    return token


# ── helpers ───────────────────────────────────────────────────────────────────

def session_dict(s) -> dict:
    return {
        "id": s.id,
        "name": s.tmux_name,
        "cwd": s.cwd,
        "created_at": s.created_at.isoformat(),
    }


# ── REST endpoints ────────────────────────────────────────────────────────────

@app.get("/api/info")
def get_info(_: str = Depends(check_token)):
    return {"hostname": HOSTNAME, "ok": True}


class CreateSessionRequest(BaseModel):
    name: Optional[str] = None
    cwd: str = "~"


@app.post("/api/sessions")
def create_session(req: CreateSessionRequest, _: str = Depends(check_token)):
    session = session_manager.create(name=req.name, cwd=req.cwd)
    return session_dict(session)


@app.get("/api/sessions")
def list_sessions(_: str = Depends(check_token)):
    return [session_dict(s) for s in session_manager.sync_and_list()]


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, _: str = Depends(check_token)):
    if not session_manager.delete(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


# ── WebSocket PTY relay ───────────────────────────────────────────────────────

@app.websocket("/ws/sessions/{session_id}")
async def ws_pty(websocket: WebSocket, session_id: str, token: str = Query(...)):
    if not secrets.compare_digest(token, AUTH_TOKEN):
        await websocket.close(code=4003)
        return

    session = session_manager.get(session_id)
    if not session:
        await websocket.close(code=4004)
        return

    await websocket.accept()
    logger.info("WS attached to session %s", session_id)

    proc = ptyprocess.PtyProcess.spawn(
        ["tmux", "attach-session", "-t", session.tmux_name],
        dimensions=(24, 80),
        env={**os.environ, "TERM": "xterm-256color"},
    )

    loop = asyncio.get_event_loop()

    async def pty_to_ws():
        """Forward PTY output to the WebSocket."""
        while True:
            try:
                data = await loop.run_in_executor(None, proc.read, 4096)
                encoded = base64.b64encode(data).decode()
                await websocket.send_text(json.dumps({"type": "output", "data": encoded}))
            except EOFError:
                try:
                    await websocket.send_text(json.dumps({"type": "exit"}))
                except Exception:
                    pass
                break
            except Exception:
                break

    async def ws_to_pty():
        """Forward WebSocket messages to the PTY."""
        try:
            while True:
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                if msg["type"] == "input":
                    proc.write(base64.b64decode(msg["data"]))
                elif msg["type"] == "resize":
                    proc.setwinsize(int(msg["rows"]), int(msg["cols"]))
        except WebSocketDisconnect:
            logger.info("WS disconnected from session %s", session_id)
        except Exception as exc:
            logger.warning("WS error on session %s: %s", session_id, exc)

    reader = asyncio.create_task(pty_to_ws())
    writer = asyncio.create_task(ws_to_pty())

    await asyncio.wait([reader, writer], return_when=asyncio.FIRST_COMPLETED)

    for task in (reader, writer):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Detach from PTY but leave the tmux session alive
    try:
        proc.terminate(force=True)
    except Exception:
        pass

    logger.info("WS relay closed for session %s", session_id)


# ── static frontend ───────────────────────────────────────────────────────────

_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="static")
