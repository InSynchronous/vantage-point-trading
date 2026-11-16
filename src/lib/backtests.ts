"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BacktestParams, BacktestResult } from "@/lib/engine";

export interface SavedBacktest {
  params: BacktestParams & { gateOverride: number | undefined; pairEntryOverride: number | undefined };
  result: BacktestResult;
  ranAt: number;
}

interface BacktestsState {
  runs: Record<string, SavedBacktest>;
  lastPid: string | null;
  hydrated: boolean;
  setHydrated: () => void;
  setLastPid: (id: string | null) => void;
  saveRun: (protocolId: string, params: SavedBacktest["params"], result: BacktestResult) => void;
  clearRun: (protocolId: string) => void;
}

function isValidResult(r: unknown): r is BacktestResult {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return Array.isArray(x.trades) && Array.isArray(x.equity) && typeof x.metrics === "object" && x.metrics !== null;
}

export function isValidSavedRun(v: unknown): v is SavedBacktest {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return typeof x.ranAt === "number" && typeof x.params === "object" && x.params !== null && isValidResult(x.result);
}

export const useBacktests = create<BacktestsState>()(persist(
  (set) => ({
    runs: {},
    lastPid: null,
    hydrated: false,
    setHydrated: () => set({ hydrated: true }),
    setLastPid: (id) => set({ lastPid: id }),
    saveRun: (protocolId, params, result) => set((s) => ({
      runs: { ...s.runs, [protocolId]: { params, result, ranAt: Date.now() } },
    })),
    clearRun: (protocolId) => set((s) => {
      const runs = { ...s.runs };
      delete runs[protocolId];
      return { runs };
    }),
  }),
  {
    name: "vpt-backtests",
    version: 2,
    partialize: (s) => ({ runs: s.runs, lastPid: s.lastPid }),
    onRehydrateStorage: () => (s) => s?.setHydrated(),
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<BacktestsState>;
      const runs: Record<string, SavedBacktest> = {};
      if (p.runs && typeof p.runs === "object") {
        for (const [k, v] of Object.entries(p.runs)) if (isValidSavedRun(v)) runs[k] = v;
      }
      return { ...current, runs, lastPid: typeof p.lastPid === "string" ? p.lastPid : null };
    },
  }
));
