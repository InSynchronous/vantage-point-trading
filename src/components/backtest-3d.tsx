"use client";
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export interface TerrainMonth {
  key: string;
  label: string;
  longPnl: number;
  shortPnl: number;
}

function barColor(v: number): string {
  return v >= 0 ? "#3aa67f" : "#e5484d";
}

function Bar({ position, height, color, onHover, dimmed }: {
  position: [number, number, number]; height: number; color: string;
  onHover: (h: boolean) => void; dimmed: boolean;
}) {
  const h = Math.max(0.08, height);
  return (
    <mesh
      position={[position[0], h / 2 + position[1], position[2]]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(false); document.body.style.cursor = ""; }}
    >
      <boxGeometry args={[0.72, h, 0.72]} />
      <meshStandardMaterial color={new THREE.Color(color)} transparent opacity={dimmed ? 0.35 : 0.92} roughness={0.35} metalness={0.15} />
    </mesh>
  );
}

function TerrainScene({ months, equity, onHover }: {
  months: TerrainMonth[];
  equity: { t: string; v: number }[];
  onHover: (info: { label: string; side: string; value: number } | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const n = months.length;
  const maxAbs = Math.max(1, ...months.flatMap((m) => [Math.abs(m.longPnl), Math.abs(m.shortPnl)]));
  const H = 6;
  const x0 = -(n - 1) / 2;

  const eqLine = useMemo(() => {
    if (!equity.length) return [];
    const vals = equity.map((e) => e.v);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(1, hi - lo);
    return equity.map((e, i) => {
      const x = (i / Math.max(1, equity.length - 1)) * (n - 1) + x0;
      return new THREE.Vector3(x, 0.4 + ((e.v - lo) / span) * (H + 1.5), 0);
    });
  }, [equity, n]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <pointLight position={[-8, 6, -6]} intensity={20} color="#3aa67f" />
      <gridHelper args={[Math.max(24, n + 8), 12, "#232d40", "#131926"]} position={[0, -0.02, 0]} />
      {months.map((m, i) => {
        const x = x0 + i;
        return (
          <group key={m.key}>
            <Bar position={[x, 0, -1.1]} height={(Math.abs(m.longPnl) / maxAbs) * H} color={barColor(m.longPnl)}
              dimmed={hovered != null && hovered !== `${i}-L`}
              onHover={(h) => { onHover(h ? { label: m.label, side: "LONG", value: m.longPnl } : null); setHovered(h ? `${i}-L` : null); }} />
            <Bar position={[x, 0, 1.1]} height={(Math.abs(m.shortPnl) / maxAbs) * H} color={barColor(m.shortPnl)}
              dimmed={hovered != null && hovered !== `${i}-S`}
              onHover={(h) => { onHover(h ? { label: m.label, side: "SHORT", value: m.shortPnl } : null); setHovered(h ? `${i}-S` : null); }} />
          </group>
        );
      })}
      {eqLine.length > 1 && (
        <Line points={eqLine} color="#e8edf4" lineWidth={2} transparent opacity={0.9} />
      )}
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.7} enablePan={false} minDistance={6} maxDistance={40} maxPolarAngle={Math.PI / 2 - 0.06} />
    </>
  );
}

export function BacktestTerrain({ months, equity, height = 420 }: {
  months: TerrainMonth[];
  equity: { t: string; v: number }[];
  height?: number;
}) {
  const [tip, setTip] = useState<{ label: string; side: string; value: number } | null>(null);
  const n = months.length;
  const dist = Math.max(12, n * 1.05);
  if (!months.length) return <div className="grid h-40 place-items-center text-[13px] text-[#525c6c]">Run a replay with closed trades to render the terrain.</div>;
  return (
    <div className="relative" style={{ height }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [dist * 0.62, dist * 0.55, dist], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <fog attach="fog" args={["#04070d", dist * 1.8, dist * 4.2]} />
        <TerrainScene months={months} equity={equity} onHover={setTip} />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-2.5 font-mono text-[11px] text-[#9da8b8]">
        back row = LONG · front row = SHORT · <span className="text-[#e8edf4]">white line = equity</span>
      </div>
      {tip && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-black/85 px-3 py-1.5 font-mono text-[12px] text-white backdrop-blur">
          {tip.label} · {tip.side} <b className={tip.value >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]"}>{tip.value >= 0 ? "+" : ""}{tip.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[10px] text-[#525c6c]">drag to orbit · scroll to zoom</div>
    </div>
  );
}
