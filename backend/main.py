"""VantagePoint research service: FastAPI + SQLite + in-process asyncio workers.

Runs on the demo Mac alongside `npm start`. One process, one file DB, no
Redis/Celery; graduates to a real queue when scheduled runs need it.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

from .research import jobs, worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    revived = await worker.resume_stale()
    if revived:
        print(f"[research] resumed {len(revived)} stale job(s): {', '.join(revived)}")
    yield


app = FastAPI(title="VantagePoint Research API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.1.172:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True, "service": "research"}


class NewJob(BaseModel):
    inquiry: str
    model: str | None = None


@app.post("/research/jobs")
async def create_job(body: NewJob):
    inquiry = (body.inquiry or "").strip()
    if not inquiry:
        return {"error": "Empty inquiry"}
    if len(inquiry) > 2000:
        return {"error": "Inquiry too long (max 2000 chars)"}
    jid = jobs.create_job(inquiry[:2000])
    await worker.submit(jid, inquiry[:2000], body.model)
    return {"id": jid}


@app.get("/research/jobs")
def list_jobs():
    return jobs.list_jobs()


@app.get("/research/jobs/{job_id}")
def get_job(job_id: str):
    j = jobs.get_job(job_id)
    if not j:
        return {"error": "Unknown job"}
    return j


@app.post("/research/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    return {"ok": worker.cancel(job_id)}


@app.delete("/research/jobs/{job_id}")
def delete_job(job_id: str):
    worker.cancel(job_id)
    jobs.delete_job(job_id)
    return {"ok": True}
