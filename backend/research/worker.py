"""Asyncio in-process worker: jobs survive tab closes (not process restarts).

Prefers the LangChain agent (lc_agent); falls back to the hand-rolled loop
if LangChain cannot start. Startup resume requeues jobs left running by a
restart so research continues without the browser open.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from . import agent, jobs

_tasks: dict[str, asyncio.Task] = {}
_use_lc: bool | None = None


def _pick_engine() -> bool:
    global _use_lc
    if _use_lc is None:
        try:
            from . import lc_agent  # noqa: F401

            lc_agent._build_llm()
            _use_lc = True
        except Exception:
            _use_lc = False
    return _use_lc


async def submit(job_id: str, inquiry: str, model: Optional[str] = None) -> None:
    cancel(job_id, silent=True)
    task = asyncio.create_task(_run(job_id, inquiry, model), name=f"research-{job_id}")
    _tasks[job_id] = task


async def _run(job_id: str, inquiry: str, model: Optional[str]) -> None:
    try:
        if _pick_engine():
            from . import lc_agent

            await lc_agent.run_inquiry(job_id, inquiry, model)
        else:
            await agent.run_inquiry(job_id, inquiry, model)
    finally:
        _tasks.pop(job_id, None)


def cancel(job_id: str, silent: bool = False) -> bool:
    j = jobs.get_job(job_id)
    if not j or j["status"] not in ("queued", "running"):
        return False
    jobs.set_status(job_id, "cancelled")
    t = _tasks.get(job_id)
    if t and not t.done():
        t.cancel()
    _tasks.pop(job_id, None)
    return True


def is_running(job_id: str) -> bool:
    t = _tasks.get(job_id)
    return bool(t and not t.done())


async def resume_stale() -> list[str]:
    """Requeue jobs left running/queued by a previous process. Returns revived ids."""
    revived: list[str] = []
    for item in jobs.list_stale():
        jobs.set_status(item["id"], "queued")
        await submit(item["id"], item["inquiry"])
        revived.append(item["id"])
    return revived
