"""LangChain ReAct researcher. Runs fully server-side in the worker process, so
an inquiry keeps working even if the user closes the tab. State lives in
SQLite; the browser only polls for steps and artifacts.

Uses langchain-core runnables (ChatOpenAI bound to tools) with an explicit
step loop, plus a delegate tool for parallel subagent fan-out. Falls back to
the hand-rolled loop in agent.py if LangChain cannot start.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from . import jobs
from .tools import execute_tool

SYSTEM = """You are VantagePoint Research, a financial research agent. You answer inquiries by calling tools, and you delegate parallel work with the delegate tool (for example one task per ticker).

STYLE: never use em dashes anywhere in your output. Use commas, colons, or periods instead.

TOOLS: call them by exact name with JSON args. Batch independent calls in one block.
- Market data: get_bars, get_news, get_snapshots, get_macro, analyze_text, compute_correlation, search_assets.
- Web: web_search (live headlines, analyst actions, why something moved), fetch_page (static article text), browse_page (JS-heavy pages that fetch_page cannot read).
- Deliverables: save_artifact. This is how charts reach the user. ALWAYS persist visual answers as artifacts, never paste big matrices into chat.
  - heatmap {tickers, matrix, volatility_ann?}: correlation tables. Compute via compute_correlation first.
  - timeseries {series: [{name, points: [[date, value]]}], normalize?: true}: overlaid price or indicator paths. Rebase with normalize when levels differ.
  - bars {items: [{label, value, sub?}], unit?}: ranked leaderboards, momentum ranks, top movers.
  - histogram {series: [{name, bins: [labels], counts: [n]}]}: return distributions. Compute bins from get_bars closes yourself.
  - table {columns, rows}: small exact-number tables. report {markdown}: prose longer than a paragraph.
- When finished, call finish_run with a 2-4 sentence summary (and a report when the user asked for one).

RULES:
- Keep each turn small. Prefer one delegate batch for 3+ independent data pulls.
- Never invent prices, correlations, or news. If a tool errors, say so and work around it.
- You are READ-ONLY. There are no trading tools. Never claim to place orders.
- Numbers with units. Cite tickers and dates.
"""

MAX_STEPS = 15
MAX_SUB_STEPS = 8
MAX_PARALLEL = 6


class _Finished(Exception):
    def __init__(self, summary: str, report: str = ""):
        super().__init__(summary)
        self.summary = summary
        self.report = report


class _Cancelled(Exception):
    pass


def _check_cancel(job_id: str) -> None:
    j = jobs.get_job(job_id)
    if j and j["status"] == "cancelled":
        raise _Cancelled()


def _build_llm(model: str | None = None):
    from langchain_openai import ChatOpenAI

    from . import config

    if not config.AI_API_KEY:
        raise RuntimeError("AI is not configured")
    return ChatOpenAI(
        model=model or config.AI_MODEL,
        base_url=config.AI_BASE_URL,
        api_key=config.AI_API_KEY,
        temperature=0.3,
        timeout=60.0,
        default_headers={"x-opencode-session": "vpt-research-lc", "User-Agent": "vantagepoint-research/1.0"},
    )


def _build_tools(job_id: str, allow_delegate: bool):
    from pydantic import BaseModel, Field
    from langchain_core.tools import StructuredTool

    async def _run(name: str, args: dict) -> dict:
        if name == "save_artifact":
            data = args.get("data")
            aid = jobs.add_artifact(
                job_id, str(args.get("type", "report")), str(args.get("title", "Artifact"))[:120],
                data if isinstance(data, dict) else {"text": str(data)[:20000]},
            )
            return {"ok": True, "artifact_id": aid}
        return await execute_tool(name, args)

    def _mk(name: str, desc: str, schema: type[BaseModel]):
        async def _impl(**kwargs: Any) -> str:
            res = await _run(name, kwargs)
            return json.dumps(res)[:12000]

        _impl.__name__ = name
        return StructuredTool.from_function(func=None, coroutine=_impl, name=name, description=desc, args_schema=schema)

    class Bars(BaseModel):
        symbol: str = Field(description="e.g. NVDA")
        days: int = Field(default=90, description="lookback window")
        end: str = Field(default="", description="optional YYYY-MM-DD")

    class News(BaseModel):
        symbols: str = Field(description="comma-separated, e.g. NVDA,AAPL")
        days_back: int = Field(default=14)
        limit: int = Field(default=20)

    class Snaps(BaseModel):
        symbols: str = Field(description="comma-separated")

    class NoArgs(BaseModel):
        pass

    class Analyze(BaseModel):
        headline: str = ""
        body: str = ""
        tickers: str = Field(default="", description="comma-separated hints")

    class Corr(BaseModel):
        tickers: list[str] = Field(description="symbols, max 20")
        days: int = Field(default=252)

    class Search(BaseModel):
        query: str = ""

    class WebSearch(BaseModel):
        query: str = ""
        num_results: int = Field(default=8)

    class Page(BaseModel):
        url: str = ""

    class Save(BaseModel):
        type: str = Field(description="report|heatmap|timeseries|bars|histogram|table")
        title: str = ""
        data: dict = Field(default_factory=dict)

    class Finish(BaseModel):
        summary: str = Field(description="2-4 sentence answer with key numbers")
        report: str = Field(default="", description="longer markdown when the user asked for a report")

    specs = [
        ("get_bars", "Daily OHLCV bars for a symbol, up to 1000.", Bars),
        ("get_news", "Recent financial headlines for symbols.", News),
        ("get_snapshots", "Latest prices and day change.", Snaps),
        ("get_macro", "CPI YoY, unemployment, Fed funds, payrolls.", NoArgs),
        ("analyze_text", "AI sentiment read of a headline and body.", Analyze),
        ("compute_correlation", "Pearson correlation of daily returns for tickers.", Corr),
        ("search_assets", "Search the tradable US equity universe.", Search),
        ("web_search", "Live web search: earnings takes, analyst actions, macro news, why a ticker moved.", WebSearch),
        ("fetch_page", "Extract readable text from a static web page.", Page),
        ("browse_page", "Render a JS-heavy page in headless Chromium and read visible text.", Page),
        ("save_artifact", "Persist a chart or report deliverable the UI renders.", Save),
    ]
    tools = [_mk(n, d, s) for n, d, s in specs]

    async def _finish(summary: str, report: str = "") -> str:
        raise _Finished(summary[:4000], report[:50000])

    tools.append(StructuredTool.from_function(func=None, coroutine=_finish, name="finish_run",
                                             description="Finish the inquiry with a summary (and optional report).", args_schema=Finish))

    if allow_delegate:
        class Delegate(BaseModel):
            goals: list[str] = Field(default=[], description="one self-contained goal string per workstream, e.g. one per ticker")
            labels: list[str] = Field(default=[], description="short labels in the same order as goals")
            tasks: list[dict] = Field(default=[], description="alternative: [{label, goal}] objects")

        async def _delegate(goals: list[str] | None = None, labels: list[str] | None = None, tasks: list[dict] | None = None) -> str:
            merged: list[dict] = []
            for g in (goals or []):
                if isinstance(g, str) and g.strip():
                    merged.append({"goal": g})
            for t in (tasks or []):
                if isinstance(t, dict) and str(t.get("goal", "")).strip():
                    merged.append(t)
                elif isinstance(t, str) and t.strip():
                    merged.append({"goal": t})
            for m, lb in zip(merged, labels or []):
                if isinstance(lb, str) and lb.strip() and not m.get("label"):
                    m["label"] = lb
            results = await _run_subagents(job_id, merged[:MAX_PARALLEL])
            return json.dumps(results)[:12000]

        tools.append(StructuredTool.from_function(func=None, coroutine=_delegate, name="delegate",
                                                 description="Fan out independent workstreams to parallel subagents (max 6). One level deep.", args_schema=Delegate))
    return tools


async def _loop(job_id: str, goal: str, model: str | None, max_steps: int, allow_delegate: bool) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

    llm = _build_llm(model)
    tools = _build_tools(job_id, allow_delegate)
    by_name = {t.name: t for t in tools}
    bound = llm.bind_tools(tools)
    messages: list = [SystemMessage(content=SYSTEM + ("" if allow_delegate else "\nYou are a SUBAGENT. No delegation. Finish with finish_run and a compact summary (key numbers included).")), HumanMessage(content=goal)]
    last = "No result."
    for step in range(1, max_steps + 1):
        _check_cancel(job_id)
        try:
            resp = await bound.ainvoke(messages)
        except _Finished as f:
            last = f.summary
            raise
        except Exception as e:  # noqa: BLE001
            if allow_delegate:
                jobs.add_step(job_id, step, "assistant", f"model call failed: {e}"[:1000])
            last = f"error: {e}"[:1000]
            break
        messages.append(resp)
        thought = (resp.content or "") if isinstance(resp.content, str) else json.dumps(resp.content)[:2000]
        calls = list(getattr(resp, "tool_calls", None) or [])
        if not calls:
            if allow_delegate:
                jobs.add_step(job_id, step, "assistant", (thought or "thinking")[:2000])
            messages.append(HumanMessage(content="No tool call and not finished. Call tools, or finish_run when done."))
            continue
        if allow_delegate:
            jobs.add_step(job_id, step, "assistant", (thought or f"Calling {[c.get('name') for c in calls]}.")[:2000])
        try:
            outs = await asyncio.gather(*[_exec(by_name, c) for c in calls[:4]])
        except _Finished as f:
            if allow_delegate:
                jobs.add_step(job_id, step, "assistant", f.summary[:2000])
            raise
        if allow_delegate:
            jobs.add_step(job_id, step, "tool", _short(outs))
        for c, o in zip(calls[:4], outs):
            messages.append(ToolMessage(content=str(o), tool_call_id=c.get("id", "")))
    return last


def _short(outs: list) -> str:
    short = []
    for o in outs:
        if isinstance(o, str) and o.startswith("{"):
            try:
                short.append(json.loads(o))
            except Exception:
                short.append(o[:2000])
        else:
            short.append(o)
    return json.dumps(short)[:12000]


async def _exec(by_name: dict, call: dict) -> str:
    tool = by_name.get(call.get("name", ""))
    if tool is None:
        return json.dumps({"error": f"unknown tool: {call.get('name')}"})
    try:
        res = await tool.ainvoke(call.get("args", {}) or {})
        return str(res)[:12000]
    except _Finished:
        raise
    except Exception as e:  # noqa: BLE001
        return json.dumps({"error": str(e)[:500]})


async def _run_subagents(job_id: str, tasks: list[dict]) -> list[dict]:
    import uuid

    sem = asyncio.Semaphore(MAX_PARALLEL)

    async def one(t: dict) -> dict:
        cid = f"sub_{uuid.uuid4().hex[:8]}"
        label = str(t.get("label") or t.get("goal", "subagent"))[:80]
        goal = str(t.get("goal", ""))[:2000]
        jobs.add_child(job_id, cid, label)
        async with sem:
            try:
                _check_cancel(job_id)
                summary = await _loop(job_id, goal, None, MAX_SUB_STEPS, allow_delegate=False)
                jobs.finish_child(job_id, cid, "done", summary)
                return {"id": cid, "label": label, "ok": True, "summary": summary}
            except _Finished as f:
                jobs.finish_child(job_id, cid, "done", f.summary)
                if f.report:
                    jobs.add_artifact(job_id, "report", label[:120], {"markdown": f.report})
                return {"id": cid, "label": label, "ok": True, "summary": f.summary}
            except _Cancelled:
                jobs.finish_child(job_id, cid, "cancelled", "Cancelled.")
                return {"id": cid, "label": label, "ok": False, "summary": "cancelled"}
            except Exception as e:  # noqa: BLE001
                jobs.finish_child(job_id, cid, "error", str(e)[:1000])
                return {"id": cid, "label": label, "ok": False, "summary": f"error: {e}"[:1000]}

    return await asyncio.gather(*(one(t) for t in tasks))


async def run_inquiry(job_id: str, inquiry: str, model: str | None = None) -> None:
    jobs.set_status(job_id, "running")
    jobs.add_step(job_id, 0, "user", inquiry)
    try:
        await _loop(job_id, inquiry, model, MAX_STEPS, allow_delegate=True)
        jobs.set_status(job_id, "error", error="Step budget exhausted without finishing.")
    except _Finished as f:
        if f.report:
            jobs.add_artifact(job_id, "report", "Research report", {"markdown": f.report})
        jobs.set_status(job_id, "done", summary=f.summary)
    except _Cancelled:
        jobs.set_status(job_id, "cancelled")
    except Exception as e:  # noqa: BLE001
        jobs.set_status(job_id, "error", error=str(e)[:1000])
