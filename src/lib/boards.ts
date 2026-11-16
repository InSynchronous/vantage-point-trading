"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WidgetType = "surface" | "prices" | "candles" | "momentum" | "dist" | "stats";
export type SurfaceDataset = "correlation" | "monthly";

export interface WidgetConfig {
  tickers: string;
  dataset?: SurfaceDataset;
  days?: number;
  months?: number;
  normalize?: boolean;
}

export interface BoardWidget {
  id: string;
  type: WidgetType;
  /** grid columns out of 12 */
  span: 4 | 6 | 8 | 12;
  config: WidgetConfig;
}

export interface Board {
  id: string;
  name: string;
  widgets: BoardWidget[];
}

let wid = 1;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(wid++).toString(36)}`;

const DEFAULT_TICKERS = "NVDA,AMD,AVGO,MSFT,TSLA,AAPL";

function seedBoards(): Board[] {
  const mk = (type: WidgetType, span: BoardWidget["span"], config: Partial<WidgetConfig>): BoardWidget =>
    ({ id: uid("w"), type, span, config: { tickers: DEFAULT_TICKERS, ...config } });
  return [{
    id: uid("b"),
    name: "Soda vs Semis",
    widgets: [
      mk("surface", 12, { dataset: "correlation", days: 252 }),
      mk("prices", 8, { normalize: true, days: 180 }),
      mk("momentum", 4, { days: 63 }),
      mk("surface", 8, { dataset: "monthly", months: 8 }),
      mk("dist", 4, { days: 504 }),
    ],
  }];
}

interface BoardsState {
  boards: Board[];
  activeId: string | null;
  hydrated: boolean;
  setHydrated: () => void;
  newBoard: (name: string) => void;
  renameBoard: (id: string, name: string) => void;
  deleteBoard: (id: string) => void;
  setActive: (id: string) => void;
  addWidget: (boardId: string, type: WidgetType) => void;
  removeWidget: (boardId: string, widgetId: string) => void;
  setSpan: (boardId: string, widgetId: string, span: BoardWidget["span"]) => void;
  setConfig: (boardId: string, widgetId: string, patch: Partial<WidgetConfig>) => void;
}

const DEFAULT_WIDGET_CONFIG: Record<WidgetType, Partial<WidgetConfig>> = {
  surface: { dataset: "correlation", days: 252, months: 8 },
  prices: { normalize: true, days: 180 },
  candles: { days: 90 },
  momentum: { days: 63 },
  dist: { days: 504 },
  stats: {},
};

export const useBoards = create<BoardsState>()(persist(
  (set) => ({
    boards: seedBoards(),
    activeId: null,
    hydrated: false,
    setHydrated: () => set({ hydrated: true }),
    newBoard: (name) => set((s) => {
      const b: Board = { id: uid("b"), name: name.trim() || "Untitled board", widgets: [] };
      return { boards: [...s.boards, b], activeId: b.id };
    }),
    renameBoard: (id, name) => set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),
    deleteBoard: (id) => set((s) => {
      const boards = s.boards.filter((b) => b.id !== id);
      return { boards, activeId: s.activeId === id ? (boards[0]?.id ?? null) : s.activeId };
    }),
    setActive: (id) => set({ activeId: id }),
    addWidget: (boardId, type) => set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId
        ? { ...b, widgets: [...b.widgets, { id: uid("w"), type, span: 6 as const, config: { tickers: DEFAULT_TICKERS, ...DEFAULT_WIDGET_CONFIG[type] } }] }
        : b)),
    })),
    removeWidget: (boardId, widgetId) => set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...b, widgets: b.widgets.filter((w) => w.id !== widgetId) } : b)),
    })),
    setSpan: (boardId, widgetId, span) => set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId
        ? { ...b, widgets: b.widgets.map((w) => (w.id === widgetId ? { ...w, span } : w)) }
        : b)),
    })),
    setConfig: (boardId, widgetId, patch) => set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId
        ? { ...b, widgets: b.widgets.map((w) => (w.id === widgetId ? { ...w, config: { ...w.config, ...patch } } : w)) }
        : b)),
    })),
  }),
  { name: "vpt-boards", partialize: (s) => ({ boards: s.boards, activeId: s.activeId }), onRehydrateStorage: () => (s) => s?.setHydrated() }
));
