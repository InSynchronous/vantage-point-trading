"""ReAct agent with parallel subagent delegation. Hand-rolled: strict JSON protocol,
no framework magic, every step inspectable."""
from __future__ import annotations

import asyncio
import json
import time
import uuid

import httpx

from . import config, jobs
from .tools import TOOLS, TOOLS_BY_NAME, execute_tool

SYSTEM = """You are VantagePoint Research, a financial research agent. You answer inquiries by using tools, and you may delegate parallel sub-tasks to subagents for independent workstreams (for example, one per ticker).

STYLE: never use em dashes anywhere in your output. Use commas, colons, or periods instead.

TOOLS (call by exact name with an args object):
{tools}

PROTOCOL: reply with NOTHING but one JSON object per turn, exactly one of:
1. {{"thought": "<brief reasoning>", "actions": [{{"id": "a1", "tool": "<name>", "args": {{...}}}}], "done": false}}
2. {{"thought": "...", "spawn": [{{"id": "s1", "goal": "<self-contained task for a subagent>", "label": "<short label>"}}], "done": false}}
   Spawn ONLY independent work (different tickers, different data pulls). Max 6 per turn. Subagents get the same tools. One level deep only.
3. {{"thought": "...", "done": true, "summary": "<2-4 sentence answer>", "report": "<optional markdown, only if the user asked for a report>"}}
   When done, ALWAYS include a summary. Use "report" for anything longer than a paragraph.

RULES:
- Keep actions per turn small (1-4 tool calls, or 1 spawn batch, not both).
- Never invent prices, correlations, or news. If a tool errors, say so and work around it.
- If the user asks for a heatmap / correlation table / chart, you MUST compute it via compute_correlation and persist with save_artifact (the UI renders artifacts; do not paste giant matrices into chat).
- Prefer subagents when 3+ independent data pulls are needed.
- You are READ-ONLY. There are no trading tools. Never claim to place orders.
- Keep responses tight. Numbers with units. Cite tickers and dates.
"""

MAX_STEPS = 15
MAX_SUB_STEPS = 8
MAX_PARALLEL = 6


async def _chat(messages: list[dict], model: str | None = None) -> str:
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(
            f"{config.AI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {config.AI_API_KEY}",
                "Content-Type": "application/json",
                "x-opencode-session": f"research-{int(time.time())}",
                "User-Agent": "vantagepoint-research/1.0",
            },
            json={
                "model": model or config.AI_MODEL,
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
                "messages": messages,
            },
        )
        r.raise_for_status()
        j = r.json()
        return (j.get("choices") or [{}])[0].get("message", {}).get("content", "{}")


def _parse(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("model did not return JSON")
    return json.loads(text[start : end + 1])


def _tools_block() -> str:
    lines = []
    for t in TOOLS:
        if t["name"] == "save_artifact":
            continue
        lines.append(f'- {t["name"]}{json.dumps(t["args"])}: {t["description"]}')
    lines.append("- save_artifact{type: report|heatmap|timeseries|table, title, data}: persist a deliverable the UI renders.")
    return "\n".join(lines)


class Cancelled(Exception):
    pass


def _check_cancel(job_id: str) -> None:
    j = jobs.get_job(job_id)
    if j and j["status"] == "cancelled":
        raise Cancelled()


async def run_inquiry(job_id: str, inquiry: str, model: str | None = None) -> None:
    jobs.set_status(job_id, "running")
    jobs.add_step(job_id, 0, "user", inquiry)
    messages = [
        {"role": "system", "content": SYSTEM.format(tools=_tools_block())},
        {"role": "user", "content": inquiry},
    ]
    try:
        for step in range(1, MAX_STEPS + 1):
            _check_cancel(job_id)
            raw = await _chat(messages, model)
            try:
                msg = _parse(raw)
            except Exception:
                jobs.add_step(job_id, step, "assistant", raw[:2000])
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user", "content": "That was not valid JSON. Reply with exactly ONE JSON object per the protocol."})
                continue
            thought = str(msg.get("thought", ""))[:2000]
            if msg.get("done"):
                summary = str(msg.get("summary", thought))[:4000]
                jobs.add_step(job_id, step, "assistant", thought + ("\n\n" + summary if summary != thought else ""))
                if msg.get("report"):
                    jobs.add_artifact(job_id, "report", "Research report", {"markdown": str(msg["report"])[:50000]})
                jobs.set_status(job_id, "done", summary=summary)
                return
            if msg.get("spawn"):
                spawns = msg["spawn"] if isinstance(msg["spawn"], list) else []
                jobs.add_step(job_id, step, "assistant", thought or "Delegating to subagents.")
                results = await _run_subagents(job_id, spawns[:MAX_PARALLEL], model)
                jobs.add_step(job_id, step, "tool", json.dumps(results)[:12000])
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user", "content": f"Subagent results:\n{json.dumps(results)[:12000]}\nContinue the inquiry."})
                continue
            actions = msg.get("actions") or []
            if not actions:
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user", "content": "No actions and not done. Either act, spawn, or finish."})
                continue
            jobs.add_step(job_id, step, "assistant", thought or "Acting.")
            results = []
            for a in actions[:4]:
                _check_cancel(job_id)
                name, args = str(a.get("tool", "")), a.get("args", {}) if isinstance(a.get("args"), dict) else {}
                if name == "save_artifact":
                    aid = jobs.add_artifact(job_id, str(args.get("type", "report")), str(args.get("title", "Artifact"))[:120], args.get("data", {}) if isinstance(args.get("data"), dict) else {"text": str(args.get("data", ""))[:20000]})
                    results.append({"id": a.get("id"), "ok": True, "artifact_id": aid})
                elif name in TOOLS_BY_NAME and name != "save_artifact":
                    results.append({"id": a.get("id"), **await execute_tool(name, args)})
                else:
                    results.append({"id": a.get("id"), "error": f"unknown tool: {name}"})
            jobs.add_step(job_id, step, "tool", json.dumps(results)[:12000])
            messages.append({"role": "assistant", "content": raw})
            messages.append({"role": "user", "content": f"Tool results:\n{json.dumps(results)[:12000]}\nContinue the inquiry."})
        jobs.set_status(job_id, "error", error="Step budget exhausted without finishing.")
    except Cancelled:
        jobs.set_status(job_id, "cancelled")
    except Exception as e:  # noqa: BLE001
        jobs.set_status(job_id, "error", error=str(e)[:1000])


async def _run_subagents(job_id: str, spawns: list[dict], model: str | None) -> list[dict]:
    sem = asyncio.Semaphore(MAX_PARALLEL)

    async def one(sp: dict) -> dict:
        cid = str(sp.get("id") or f"sub_{uuid.uuid4().hex[:8]}")
        label = str(sp.get("label") or sp.get("goal", "subagent"))[:80]
        goal = str(sp.get("goal", ""))[:2000]
        jobs.add_child(job_id, cid, label)
        async with sem:
            try:
                summary = await _sub_loop(goal, model, job_id)
                jobs.finish_child(job_id, cid, "done", summary)
                return {"id": cid, "label": label, "ok": True, "summary": summary}
            except Cancelled:
                jobs.finish_child(job_id, cid, "cancelled", "Cancelled.")
                return {"id": cid, "label": label, "ok": False, "summary": "cancelled"}
            except Exception as e:  # noqa: BLE001
                jobs.finish_child(job_id, cid, "error", str(e)[:1000])
                return {"id": cid, "label": label, "ok": False, "summary": f"error: {e}"[:1000]}

    return await asyncio.gather(*(one(s) for s in spawns if isinstance(s, dict)))


async def _sub_loop(goal: str, model: str | None, job_id: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM.format(tools=_tools_block()) + "\nYou are a SUBAGENT. No spawning. Answer the single goal with tools, then finish with done:true and a compact summary (key numbers included)."},
        {"role": "user", "content": goal},
    ]
    last_summary = "No result."
    for _ in range(MAX_SUB_STEPS):
        _check_cancel(job_id)
        try:
            msg = _parse(await _chat(messages, model))
        except Exception:
            break
        if msg.get("done"):
            last_summary = str(msg.get("summary") or msg.get("thought", ""))[:2000]
            break
        acted = False
        for a in (msg.get("actions") or [])[:3]:
            name, args = str(a.get("tool", "")), a.get("args", {}) if isinstance(a.get("args"), dict) else {}
            acted = True
            res = {"id": a.get("id"), "error": f"unknown tool: {name}"}
            if name in TOOLS_BY_NAME and name != "save_artifact":
                res = {"id": a.get("id"), **await execute_tool(name, args)}
            messages.append({"role": "assistant", "content": json.dumps(msg)[:4000]})
            messages.append({"role": "user", "content": f"Tool result: {json.dumps(res)[:6000]}"})
            break
        if not acted:
            break
    return last_summary
