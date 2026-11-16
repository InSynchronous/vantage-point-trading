"use client";
import { useState } from "react";
import { Plus, Trash2, X, Pencil, Check } from "lucide-react";
import { clsx } from "clsx";
import { useBoards, type BoardWidget, type WidgetType } from "@/lib/boards";
import { BoardWidgetView, WIDGET_DEFS } from "@/components/board-widgets";

export const dynamic = "force-dynamic";

const SPANS: BoardWidget["span"][] = [4, 6, 8, 12];
const SPAN_LABEL: Record<number, string> = { 4: "1/3", 6: "1/2", 8: "2/3", 12: "Full" };
const SPAN_CLASS: Record<number, string> = {
  4: "col-span-12 md:col-span-4",
  6: "col-span-12 md:col-span-6",
  8: "col-span-12 md:col-span-8",
  12: "col-span-12",
};

export default function BoardsPage() {
  const boards = useBoards((s) => s.boards);
  const activeId = useBoards((s) => s.activeId);
  const hydrated = useBoards((s) => s.hydrated);
  const setActive = useBoards((s) => s.setActive);
  const newBoard = useBoards((s) => s.newBoard);
  const renameBoard = useBoards((s) => s.renameBoard);
  const deleteBoard = useBoards((s) => s.deleteBoard);
  const addWidget = useBoards((s) => s.addWidget);
  const removeWidget = useBoards((s) => s.removeWidget);
  const setSpan = useBoards((s) => s.setSpan);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  if (!hydrated) {
    return (
      <div className="grid h-[calc(100vh-56px)] place-items-center font-mono text-[12px] text-[#525c6c]">
        loading boards…
      </div>
    );
  }

  const active = boards.find((b) => b.id === activeId) ?? boards[0] ?? null;
  const cycleSpan = (w: BoardWidget) => setSpan(active!.id, w.id, SPANS[(SPANS.indexOf(w.span) + 1) % SPANS.length]);

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* board list + palette */}
      <div className="flex w-[264px] shrink-0 flex-col border-r border-white/[0.07] bg-[#060b16]">
        <div className="border-b border-white/[0.07] p-3">
          <div className="vp-label mb-1.5">Boards</div>
          {!naming ? (
            <button onClick={() => { setNaming(true); setNameDraft(""); }} className="flex w-full items-center justify-center gap-2 rounded-md bg-[#e8edf4] py-2 text-[12.5px] font-bold text-black hover:bg-white">
              <Plus className="h-4 w-4" /> New board
            </button>
          ) : (
            <div className="flex gap-1.5">
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter") { newBoard(nameDraft || "Untitled board"); setNaming(false); }
                if (e.key === "Escape") setNaming(false);
              }} autoFocus placeholder="Board name…" className="vp-input min-w-0 flex-1 !py-2 text-[12.5px]" />
              <button onClick={() => { newBoard(nameDraft || "Untitled board"); setNaming(false); }} className="rounded-md bg-[#e8edf4] px-2.5 text-black hover:bg-white"><Check className="h-4 w-4" /></button>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
          {boards.map((b) => (
            <div key={b.id} className={clsx("group rounded-lg border p-2.5", active?.id === b.id ? "border-white/20 bg-white/[0.05]" : "border-transparent hover:bg-white/[0.03]")}>
              <button onClick={() => setActive(b.id)} className="block w-full text-left">
                <div className="truncate text-[12.5px] font-semibold text-white">{b.name}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[#525c6c]">{b.widgets.length} widget{b.widgets.length === 1 ? "" : "s"}</div>
              </button>
              <div className="mt-1 hidden justify-end group-hover:flex">
                <button onClick={() => deleteBoard(b.id)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-[#525c6c] hover:bg-white/[0.06] hover:text-[#f1999c]">
                  <Trash2 className="h-3 w-3" /> delete
                </button>
              </div>
            </div>
          ))}
          {boards.length === 0 && <div className="p-3 text-[12px] text-[#525c6c]">No boards yet. Create one to start.</div>}
        </div>
        <div className="border-t border-white/[0.07] p-2.5">
          <div className="vp-label mb-1.5 px-0.5">Add widget</div>
          <div className="grid grid-cols-2 gap-1.5">
            {WIDGET_DEFS.map((d) => (
              <button key={d.type} disabled={!active} onClick={() => active && addWidget(active.id, d.type as WidgetType)}
                title={d.blurb} className="rounded-md border border-white/10 px-2 py-2 text-left text-[11.5px] font-semibold text-[#c7cfda] hover:border-white/25 hover:text-white disabled:opacity-40">
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* canvas */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-[#04070d] p-6">
        {!active ? (
          <div className="vp-card grid place-items-center p-16 text-center">
            <div><div className="text-[14px] font-bold text-white">No board selected</div>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[#646e7e]">Create a board, then add widgets from the palette.</p></div>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2">
              {renaming ? (
                <span className="flex items-center gap-2">
                  <input value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => {
                    if (e.key === "Enter" && active) { renameBoard(active.id, renameDraft.trim() || active.name); setRenaming(false); }
                    if (e.key === "Escape") setRenaming(false);
                  }} autoFocus className="vp-input w-64 !py-1.5 text-[18px] font-extrabold" />
                  <button onClick={() => { if (active) renameBoard(active.id, renameDraft.trim() || active.name); setRenaming(false); }} className="rounded-md bg-[#e8edf4] px-2.5 py-1.5 text-black hover:bg-white"><Check className="h-4 w-4" /></button>
                </span>
              ) : (
                <button onClick={() => { setRenameDraft(active.name); setRenaming(true); }} title="Rename board"
                  className="flex items-center gap-2 text-[20px] font-extrabold text-white hover:text-[#e8edf4]">
                  {active.name} <Pencil className="h-3.5 w-3.5 text-[#525c6c]" />
                </button>
              )}
              <span className="font-mono text-[11px] text-[#525c6c]">{active.widgets.length} widget{active.widgets.length === 1 ? "" : "s"}</span>
            </div>
            <p className="mb-4 max-w-[70ch] text-[13px] text-[#9da8b8]">Real Alpaca data, computed in your browser. Hover the 3D terrain to read values, drag to orbit.</p>
            {active.widgets.length === 0 ? (
              <div className="vp-card grid place-items-center p-16 text-center">
                <div><div className="text-[14px] font-bold text-white">Empty canvas</div>
                <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[#646e7e]">Add a widget from the palette. Start with the 3D surface.</p></div>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-3">
                {active.widgets.map((w) => (
                  <div key={w.id} className={clsx("vp-card min-w-0 p-4", SPAN_CLASS[w.span])}>
                    <div className="mb-1 flex items-center justify-end gap-1">
                      <span className="mr-auto font-mono text-[10px] uppercase tracking-wider text-[#525c6c]">{WIDGET_DEFS.find((d) => d.type === w.type)?.label}</span>
                      <button onClick={() => cycleSpan(w)} title={`Width: ${SPAN_LABEL[w.span]} (click to resize)`}
                        className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-[#9da8b8] hover:border-white/25 hover:text-white">
                        {SPAN_LABEL[w.span]}
                      </button>
                      <button onClick={() => removeWidget(active.id, w.id)} title="Remove widget" className="rounded p-1 text-[#525c6c] hover:bg-white/[0.06] hover:text-[#f1999c]">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <BoardWidgetView widget={w} boardId={active.id} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
