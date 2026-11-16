"use client";

const BASE = process.env.NEXT_PUBLIC_RESEARCH_API_URL || "http://localhost:8100";

export interface ResearchStep { role: string; content: string }
export interface ResearchChild { id: string; label: string; status: string; summary: string }
export interface ResearchArtifact { id: string; type: "report" | "heatmap" | "timeseries" | "bars" | "histogram" | "table"; title: string; data: any }
export interface ResearchJob {
  id: string; inquiry: string; status: "queued" | "running" | "done" | "error" | "cancelled";
  summary: string; error: string; created_at: number; updated_at: number;
  steps?: ResearchStep[]; children?: ResearchChild[]; artifacts?: ResearchArtifact[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `request failed (${r.status})`);
  return j as T;
}

export const startJob = (inquiry: string, model?: string) =>
  req<{ id: string } | { error: string }>("/research/jobs", { method: "POST", body: JSON.stringify({ inquiry, model }) });
export const listJobs = () => req<ResearchJob[]>("/research/jobs");
export const getJob = (id: string) => req<ResearchJob>(`/research/jobs/${id}`);
export const cancelJob = (id: string) => req<{ ok: boolean }>(`/research/jobs/${id}/cancel`, { method: "POST" });
export const deleteJob = (id: string) => req<{ ok: boolean }>(`/research/jobs/${id}`, { method: "DELETE" });
export const researchHealthy = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
};
