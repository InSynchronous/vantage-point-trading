"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Workflow, FlaskConical, Newspaper, Store, ChevronLeft, ChartCandlestick, LogOut, Telescope, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { getProfile, initialsOf, signOut, sessionActive } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/terminal", label: "Terminal", icon: ChartCandlestick },
  { href: "/builder", label: "Protocol Builder", icon: Workflow },
  { href: "/backtest", label: "Backtesting", icon: FlaskConical },
  { href: "/intelligence", label: "Market Intel", icon: Newspaper },
  { href: "/research", label: "Research", icon: Telescope },
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/marketplace", label: "Marketplace", icon: Store },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="VantagePoint" className="h-8 w-8 rounded-lg object-cover" />
      <div className="leading-none">
        <div className="text-[14px] font-bold tracking-tight text-[#e7ecf3]">VantagePoint</div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#646e7e]">Trading Terminal</div>
      </div>
    </div>
  );
}

function useAccount() {
  const [equity, setEquity] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/alpaca/account", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (typeof j.equity === "number") setEquity(j.equity.toLocaleString("en-US", { style: "currency", currency: "USD" })); })
      .catch(() => {});
  }, []);
  return equity;
}

function useSpy() {
  const [pill, setPill] = useState<{ price: string; chg: string; up: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/alpaca/snapshots?symbols=SPY", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const s = Array.isArray(j) ? j[0] : null;
        if (s?.price != null) setPill({
          price: Number(s.price).toFixed(2),
          chg: `${(s.changePct ?? 0) >= 0 ? "+" : ""}${(s.changePct ?? 0).toFixed(2)}%`,
          up: (s.changePct ?? 0) >= 0,
        });
      })
      .catch(() => {});
  }, []);
  return pill;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const equity = useAccount();
  const spy = useSpy();
  return (
    <div className="flex min-h-screen bg-[#070b12] text-[#e7ecf3]">
      <RouteLoader path={path} />
      <aside className={clsx("sticky top-0 flex h-screen shrink-0 flex-col border-r border-white/[0.07] bg-[#0a0f17] transition-all", collapsed ? "w-[64px]" : "w-[224px]")}>
        <div className="flex h-16 items-center justify-between px-4">
          {!collapsed && <Logo />}
          {collapsed && (
            <div className="mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="VantagePoint" className="h-8 w-8 rounded-lg object-cover" />
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 px-2.5">
          {!collapsed && <div className="vp-ledger-head px-2 pb-1.5 pt-1">Workspace</div>}
          {NAV.map((n) => {
            const active = path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href}
                className={clsx("group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  active ? "bg-white/[0.07] text-white" : "text-[#9da8b8] hover:bg-white/[0.04] hover:text-white")}>
                <Icon className={clsx("h-[16px] w-[16px] shrink-0", active ? "text-white" : "text-[#646e7e] group-hover:text-[#9da8b8]")} strokeWidth={1.75} />
                {!collapsed && <span>{n.label}</span>}
                {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e8edf4]" />}
                {!collapsed && !active && n.label === "Protocol Builder" && <span className="ml-auto rounded border border-white/10 px-1.5 py-px font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#646e7e]">Core</span>}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2.5 p-3">
          {!collapsed && (
            <div className="rounded-lg border border-white/[0.07] bg-[#0c121c] p-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3aa67f]" />
                Account
                <span className="ml-auto font-mono text-[10px] font-normal text-[#646e7e]">ALPACA</span>
              </div>
              <div className="mt-2 font-mono text-[20px] font-bold tracking-tight text-white">{equity ?? "…"}</div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="flex w-full items-center justify-center gap-2 rounded-md border border-white/[0.07] py-2 text-[12px] text-[#9da8b8] hover:bg-white/[0.04] hover:text-white">
            <ChevronLeft className={clsx("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/[0.07] bg-[#070b12]/95 px-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-[#646e7e]">VantagePoint</span>
            <span className="text-[#2a3342]">/</span>
            <span className="font-semibold text-white capitalize">{path === "/dashboard" ? "Dashboard" : path.slice(1).split("/")[0] || "Dashboard"}</span>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {spy && (
              <div className="hidden items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 font-mono text-[11.5px] text-[#9da8b8] md:flex">
                <span className={`h-1.5 w-1.5 rounded-full ${spy.up ? "bg-[#3aa67f]" : "bg-[#e5484d]"}`} />
                <span className="font-sans font-semibold text-[#e7ecf3]">SPY {spy.price}</span>
                <span className={spy.up ? "text-[#3aa67f]" : "text-[#e5484d]"}>{spy.chg}</span>
              </div>
            )}
            <UserBadge />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function UserBadge() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const p = getProfile();
    if (p && sessionActive()) { setName(p.name); setEmail(p.email); }
  }, []);
  if (!name) {
    return (
      <button onClick={() => router.push("/get-started")} className="rounded-md bg-[#e8edf4] px-3 py-1.5 text-[12px] font-bold text-black hover:bg-white">
        Sign in
      </button>
    );
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} title={email ?? ""} className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-white hover:bg-white/[0.08]">
        {initialsOf(name)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-white/10 bg-[#0c121c] py-1 shadow-2xl">
            <div className="px-3 py-2"><div className="truncate text-[13px] font-bold text-white">{name}</div><div className="truncate font-mono text-[11px] text-[#646e7e]">{email}</div></div>
            <button onClick={() => { signOut(); setOpen(false); setName(null); router.push("/"); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[#f1999c] hover:bg-white/[0.05]">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RouteLoader({ path }: { path: string }) {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), 650);
    return () => clearTimeout(t);
  }, [path]);
  if (!on) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-[2px] overflow-hidden bg-transparent">
      <div className="h-full w-1/3 bg-[#e8edf4] vp-route-bar" />
    </div>
  );
}
