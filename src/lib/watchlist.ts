"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_WATCHLIST = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA"];
const MAX_WATCHLIST = 15;

export function cleanSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[^A-Z.\-]/g, "").slice(0, 8);
  return s.length ? s : null;
}

interface WatchlistState {
  symbols: string[];
  hydrated: boolean;
  setHydrated: () => void;
  add: (raw: string) => boolean;
  remove: (symbol: string) => void;
}

export const useWatchlist = create<WatchlistState>()(persist(
  (set) => ({
    symbols: DEFAULT_WATCHLIST,
    hydrated: false,
    setHydrated: () => set({ hydrated: true }),
    add: (raw) => {
      const s = cleanSymbol(raw);
      if (!s) return false;
      let added = false;
      set((st) => {
        if (st.symbols.includes(s) || st.symbols.length >= MAX_WATCHLIST) return st;
        added = true;
        return { symbols: [...st.symbols, s] };
      });
      return added;
    },
    remove: (symbol) => set((st) => ({ symbols: st.symbols.filter((x) => x !== symbol) })),
  }),
  {
    name: "vpt-watchlist",
    partialize: (s) => ({ symbols: s.symbols }),
    onRehydrateStorage: () => (s) => s?.setHydrated(),
  }
));
