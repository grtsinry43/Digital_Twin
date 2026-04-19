import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WorldState } from "../playback/world";

interface Props {
  worldA: WorldState;
  worldB: WorldState;
  tSim: number;
}

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

export function KPIPanel({ worldA, worldB, tSim }: Props) {
  // 合并两条序列：按 t 采样成相同时间轴
  const merged: { t: number; A_count?: number; B_count?: number; A_avg?: number; B_avg?: number }[] = [];
  const all = new Map<number, { A_count?: number; B_count?: number; A_avg?: number; B_avg?: number }>();
  for (const p of worldA.cumulative) {
    const row = all.get(p.t) ?? {};
    row.A_count = p.count;
    row.A_avg = Math.round(p.avg_ct);
    all.set(p.t, row);
  }
  for (const p of worldB.cumulative) {
    const row = all.get(p.t) ?? {};
    row.B_count = p.count;
    row.B_avg = Math.round(p.avg_ct);
    all.set(p.t, row);
  }
  const sorted = [...all.entries()].sort((a, b) => a[0] - b[0]);
  let lastA = { c: 0, a: 0 };
  let lastB = { c: 0, a: 0 };
  for (const [t, r] of sorted) {
    if (r.A_count != null) lastA = { c: r.A_count, a: r.A_avg! };
    if (r.B_count != null) lastB = { c: r.B_count, a: r.B_avg! };
    merged.push({ t, A_count: lastA.c, B_count: lastB.c, A_avg: lastA.a, B_avg: lastB.a });
  }

  const kpiA = worldA.cumulative[worldA.cumulative.length - 1];
  const kpiB = worldB.cumulative[worldB.cumulative.length - 1];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, height: "100%" }}>
      <KPICard
        title="累计完成件数"
        unit=""
        a={kpiA?.count ?? 0}
        b={kpiB?.count ?? 0}
        accentA="#5ba8ff"
        accentB="#f39c12"
      />
      <KPICard
        title="滑动 Avg CT"
        unit="s"
        a={kpiA ? Math.round(kpiA.avg_ct) : 0}
        b={kpiB ? Math.round(kpiB.avg_ct) : 0}
        accentA="#5ba8ff"
        accentB="#f39c12"
        lowerIsBetter
      />
      <div
        style={{
          background: "#12151c",
          border: "1px solid #262c38",
          borderRadius: 4,
          padding: 10,
        }}
      >
        <div style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>
          累计完成随时间（t={tSim.toFixed(0)}）
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={merged} margin={{ top: 2, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
            <XAxis dataKey="t" {...AXIS} />
            <YAxis {...AXIS} />
            <Tooltip
              contentStyle={{ background: "#161b22", border: "1px solid #262c38", fontSize: 12 }}
              labelStyle={{ color: "#a6adb8" }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="A_count" stroke="#5ba8ff" strokeWidth={2} dot={false} name="Case01" />
            <Line type="monotone" dataKey="B_count" stroke="#f39c12" strokeWidth={2} dot={false} name="Case02" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KPICard({
  title,
  unit,
  a,
  b,
  accentA,
  accentB,
  lowerIsBetter,
}: {
  title: string;
  unit: string;
  a: number;
  b: number;
  accentA: string;
  accentB: string;
  lowerIsBetter?: boolean;
}) {
  const delta = b - a;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  const pct = a === 0 ? 0 : ((b - a) / a) * 100;
  return (
    <div
      style={{
        background: "#12151c",
        border: "1px solid #262c38",
        borderRadius: 4,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
    >
      <div style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>{title}</div>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <Stat label="Case01" value={a} unit={unit} color={accentA} />
        <Stat label="Case02" value={b} unit={unit} color={accentB} />
      </div>
      <div style={{ fontSize: 11, color: better ? "#2ecc71" : "#e74c3c" }}>
        Δ {delta > 0 ? "+" : ""}
        {delta.toFixed(0)} ({pct > 0 ? "+" : ""}
        {pct.toFixed(1)}%)
      </div>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div>
      <div style={{ color: "#5c6370", fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
        <span style={{ color: "#5c6370", fontSize: 12, marginLeft: 3 }}>{unit}</span>
      </div>
    </div>
  );
}
