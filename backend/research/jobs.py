"""SQLite job store. One file, no server required beyond the FastAPI process."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from . import config

_lock = threading.Lock()
_db: sqlite3.Connection | None = None


def _conn() -> sqlite3.Connection:
    global _db
    if _db is None:
        Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        _db = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, inquiry TEXT NOT NULL, status TEXT NOT NULL,
              summary TEXT DEFAULT '', error TEXT DEFAULT '',
              created_at REAL NOT NULL, updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS steps (
              id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
              idx INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS children (
              id TEXT PRIMARY KEY, job_id TEXT NOT NULL, label TEXT NOT NULL,
              status TEXT NOT NULL, summary TEXT DEFAULT '', created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS artifacts (
              id TEXT PRIMARY KEY, job_id TEXT NOT NULL, type TEXT NOT NULL,
              title TEXT NOT NULL, data TEXT NOT NULL, created_at REAL NOT NULL
            );
            """
        )
    return _db


def _now() -> float:
    return time.time()


def create_job(inquiry: str) -> str:
    jid = f"job_{uuid.uuid4().hex[:12]}"
    with _lock:
        c = _conn()
        c.execute(
            "INSERT INTO jobs (id, inquiry, status, created_at, updated_at) VALUES (?,?,?,?,?)",
            (jid, inquiry, "queued", _now(), _now()),
        )
        c.commit()
    return jid


def set_status(job_id: str, status: str, error: str = "", summary: str | None = None) -> None:
    with _lock:
        c = _conn()
        if summary is None:
            c.execute("UPDATE jobs SET status=?, error=?, updated_at=? WHERE id=?", (status, error, _now(), job_id))
        else:
            c.execute("UPDATE jobs SET status=?, error=?, summary=?, updated_at=? WHERE id=?", (status, error, summary, _now(), job_id))
        c.commit()


def add_step(job_id: str, idx: int, role: str, content: str) -> None:
    with _lock:
        c = _conn()
        c.execute("INSERT INTO steps (job_id, idx, role, content, created_at) VALUES (?,?,?,?,?)", (job_id, idx, role, content[:20000], _now()))
        c.execute("UPDATE jobs SET updated_at=? WHERE id=?", (_now(), job_id))
        c.commit()


def add_child(job_id: str, child_id: str, label: str) -> None:
    with _lock:
        c = _conn()
        c.execute("INSERT OR REPLACE INTO children (id, job_id, label, status, created_at) VALUES (?,?,?,?,?)", (child_id, job_id, label, "running", _now()))
        c.commit()


def finish_child(job_id: str, child_id: str, status: str, summary: str) -> None:
    with _lock:
        c = _conn()
        c.execute("UPDATE children SET status=?, summary=? WHERE id=? AND job_id=?", (status, summary[:4000], child_id, job_id))
        c.commit()


def add_artifact(job_id: str, type: str, title: str, data: dict) -> str:
    aid = f"art_{uuid.uuid4().hex[:10]}"
    with _lock:
        c = _conn()
        c.execute(
            "INSERT INTO artifacts (id, job_id, type, title, data, created_at) VALUES (?,?,?,?,?,?)",
            (aid, job_id, type, title, json.dumps(data)[:200000], _now()),
        )
        c.commit()
    return aid


def _row_to_job(r: sqlite3.Row) -> dict:
    return {"id": r["id"], "inquiry": r["inquiry"], "status": r["status"], "summary": r["summary"] or "", "error": r["error"] or "", "created_at": r["created_at"], "updated_at": r["updated_at"]}


def get_job(job_id: str) -> dict | None:
    with _lock:
        c = _conn()
        r = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not r:
            return None
        job = _row_to_job(r)
        job["steps"] = [{"role": s["role"], "content": s["content"]} for s in c.execute("SELECT role, content FROM steps WHERE job_id=? ORDER BY idx", (job_id,))]
        job["children"] = [{"id": ch["id"], "label": ch["label"], "status": ch["status"], "summary": ch["summary"]} for ch in c.execute("SELECT * FROM children WHERE job_id=? ORDER BY created_at", (job_id,))]
        job["artifacts"] = [{"id": a["id"], "type": a["type"], "title": a["title"], "data": json.loads(a["data"])} for a in c.execute("SELECT * FROM artifacts WHERE job_id=? ORDER BY created_at", (job_id,))]
    return job


def list_jobs(limit: int = 30) -> list[dict]:
    with _lock:
        c = _conn()
        rows = c.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [_row_to_job(r) for r in rows]


def delete_job(job_id: str) -> None:
    with _lock:
        c = _conn()
        c.execute("DELETE FROM steps WHERE job_id=?", (job_id,))
        c.execute("DELETE FROM children WHERE job_id=?", (job_id,))
        c.execute("DELETE FROM artifacts WHERE job_id=?", (job_id,))
        c.execute("DELETE FROM jobs WHERE id=?", (job_id,))
        c.commit()


def list_stale() -> list[dict]:
  """Jobs left mid-flight by a dead process. Caller requeues them."""
  with _lock:
    c = _conn()
    rows = c.execute("SELECT id, inquiry FROM jobs WHERE status IN ('queued','running') ORDER BY created_at").fetchall()
    return [{"id": r["id"], "inquiry": r["inquiry"]} for r in rows]
