"use client";
import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

function lerpColor(t: number): THREE.Color {
  // t in [-1, 1]: red -> dark -> green
  const c = new THREE.Color();
  if (t >= 0) c.set("#141a26").lerp(new THREE.Color("#3aa67f"), Math.min(1, t * 1.15));
  else c.set("#141a26").lerp(new THREE.Color("#e5484d"), Math.min(1, -t * 1.15));
  return c;
}

function makeLabel(text: string, accent = false): THREE.Sprite {
  const font = "700 40px ui-monospace, SFMono-Regular, Menlo, monospace";
  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = font;
  const w = Math.ceil(meas.measureText(text).width) + 28;
  const c = document.createElement("canvas");
  c.width = w; c.height = 64;
  const g = c.getContext("2d")!;
  g.font = font;
  g.fillStyle = accent ? "#e8edf4" : "#8a94a6";
  g.textBaseline = "middle";
  g.fillText(text, 14, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(c.width * 0.011, c.height * 0.011, 1);
  return sp;
}

function Bar({ position, height, color, onHover, dimmed }: {
  position: [number, number, number]; height: number; color: THREE.Color;
  onHover: (h: boolean) => void; dimmed: boolean;
}) {
  const h = Math.max(0.1, height);
  return (
    <mesh
      position={[position[0], h / 2, position[2]]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(false); document.body.style.cursor = ""; }}
    >
      <boxGeometry args={[0.78, h, 0.78]} />
      <meshStandardMaterial color={color} transparent opacity={dimmed ? 0.3 : 0.95} roughness={0.32} metalness={0.2} />
    </mesh>
  );
}

export interface SurfaceTip { row: string; col: string; value: number }

function SurfaceScene({ rows, cols, values, onHover }: {
  rows: string[]; cols: string[]; values: number[][];
  onHover: (t: SurfaceTip | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const nx = cols.length, nz = rows.length;
  const maxAbs = Math.max(1e-9, ...values.flatMap((r) => r.map((v) => Math.abs(v))));
  const H = 5.2;
  const gap = 1.18;
  const x0 = -((nx - 1) * gap) / 2, z0 = -((nz - 1) * gap) / 2;

  const rowSprites = useMemo(() => rows.map((r) => makeLabel(r)), [rows.join("|")]);
  const colSprites = useMemo(() => cols.map((c) => makeLabel(c)), [cols.join("|")]);

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 12, 4]} intensity={1.2} />
      <pointLight position={[-9, 7, -7]} intensity={26} color="#3aa67f" />
      <pointLight position={[9, 5, 9]} intensity={14} color="#4c6fff" />
      <gridHelper args={[Math.max(28, Math.max(nx, nz) * 2.2), 14, "#232d40", "#11161f"]} position={[0, -0.02, 0]} />
      {rows.map((r, zi) => cols.map((c, xi) => {
        const v = values[zi]?.[xi] ?? 0;
        const key = `${zi}:${xi}`;
        const t = Math.max(-1, Math.min(1, v / maxAbs));
        return (
          <Bar key={key}
            position={[x0 + xi * gap, 0, z0 + zi * gap]}
            height={0.12 + Math.abs(t) * H}
            color={lerpColor(t)}
            dimmed={hovered != null && hovered !== key}
            onHover={(h) => { onHover(h ? { row: r, col: c, value: v } : null); setHovered(h ? key : null); }} />
        );
      }))}
      {rowSprites.map((sp, zi) => (<primitive key={`r${zi}`} object={sp} position={[x0 + (nx - 1) * gap + 1.15, 0.1, z0 + zi * gap]} />))}
      {colSprites.map((sp, xi) => (<primitive key={`c${xi}`} object={sp} position={[x0 + xi * gap, 0.1, z0 + (nz - 1) * gap + 1.15]} />))}
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.6} enablePan={false} minDistance={7} maxDistance={46} maxPolarAngle={Math.PI / 2 - 0.06} />
    </>
  );
}

export function Surface3D({ rows, cols, values, unit = "", height = 380, emptyHint }: {
  rows: string[]; cols: string[]; values: number[][]; unit?: string; height?: number; emptyHint?: string;
}) {
  const [tip, setTip] = useState<SurfaceTip | null>(null);
  const n = Math.max(rows.length, cols.length);
  const dist = Math.max(13, n * 1.7);
  if (!rows.length || !cols.length || !values.length) {
    return <div className="grid h-40 place-items-center text-[13px] text-[#525c6c]">{emptyHint ?? "No matrix data."}</div>;
  }
  const flat = values.flat();
  const mx = Math.max(...flat.map((v) => Math.abs(v)));
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) < 10 && mx < 10 ? 2 : 0)}${unit}`;
  return (
    <div className="relative" style={{ height }}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [dist * 0.66, dist * 0.6, dist], fov: 42 }} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
        <fog attach="fog" args={["#04070d", dist * 1.9, dist * 4.4]} />
        <SurfaceScene rows={rows} cols={cols} values={values} onHover={setTip} />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2">
        <span className="font-mono text-[10.5px] text-[#525c6c]">{fmt(-mx)}</span>
        <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg,#e5484d,#141a26 50%,#3aa67f)" }} />
        <span className="font-mono text-[10.5px] text-[#525c6c]">{fmt(mx)}</span>
      </div>
      {tip && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/15 bg-black/85 px-3 py-1.5 font-mono text-[12px] text-white backdrop-blur">
          {tip.row} × {tip.col} <b className={tip.value >= 0 ? "text-[#3aa67f]" : "text-[#e5484d]"}>{fmt(tip.value)}</b>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[10px] text-[#525c6c]">drag to orbit · scroll to zoom</div>
    </div>
  );
}
