import { memo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analytics } from "../../analytics";

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

interface Props {
  a: Analytics;
  b: Analytics;
}

// Q3 入口对应的 conveyor id = 3 (M2→Q3)，Q4 入口 conveyor id = 4 (M2→Q4)
const VIA_Q3 = 3;
const VIA_Q4 = 4;

function summarize(times: { viaConvId: number; duration: number }[], cid: number) {
  const xs = times.filter((p) => p.viaConvId === cid).map((p) => p.duration);
  if (!xs.length) return { count: 0, avg: 0, min: 0, max: 0, p50: 0 };
  xs.sort((a, b) => a - b);
  const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
  return { count: xs.length, avg, min: xs[0], max: xs[xs.length - 1], p50: xs[Math.floor(xs.length / 2)] };
}

export const PathTimeChart = memo(function PathTimeChart({ a, b }: Props) {
  const a3 = summarize(a.pathTimes, VIA_Q3);
  const a4 = summarize(a.pathTimes, VIA_Q4);
  const b3 = summarize(b.pathTimes, VIA_Q3);
  const b4 = summarize(b.pathTimes, VIA_Q4);

  const data = [
    { name: "走 Q3 (慢路径)", Case01: +a3.avg.toFixed(1), Case02: +b3.avg.toFixed(1), A_n: a3.count, B_n: b3.count, A_min: a3.min, A_max: a3.max, B_min: b3.min, B_max: b3.max },
    { name: "走 Q4 (快路径)", Case01: +a4.avg.toFixed(1), Case02: +b4.avg.toFixed(1), A_n: a4.count, B_n: b4.count, A_min: a4.min, A_max: a4.max, B_min: b4.min, B_max: b4.max },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>
        分支路径实际耗时（M2 出发 → terminate）· 平均秒
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <RouteCard title="Case01 · 走 Q3" color="#5ba8ff" s={a3} />
        <RouteCard title="Case01 · 走 Q4" color="#5ba8ff" s={a4} />
        <RouteCard title="Case02 · 走 Q3" color="#f39c12" s={b3} />
        <RouteCard title="Case02 · 走 Q4" color="#f39c12" s={b4} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 16, left: -8, bottom: 4 }}>
            <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} unit="s" />
            <Tooltip
              contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 12 }}
              labelStyle={{ color: "#a6adb8" }}
              formatter={(v: any, _n: any, payload: any) => {
                const isA = payload.dataKey === "Case01";
                const n = isA ? payload.payload.A_n : payload.payload.B_n;
                const min = isA ? payload.payload.A_min : payload.payload.B_min;
                const max = isA ? payload.payload.A_max : payload.payload.B_max;
                return [`${v}s 平均  ·  n=${n}  ·  范围 ${min.toFixed(0)}–${max.toFixed(0)}s`, payload.dataKey];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Case01" fill="#5ba8ff" isAnimationActive={false}>
              <LabelList dataKey="Case01" position="top" style={{ fill: "#5ba8ff", fontSize: 10 }} formatter={(v: any) => `${v}s`} />
            </Bar>
            <Bar dataKey="Case02" fill="#f39c12" isAnimationActive={false}>
              <LabelList dataKey="Case02" position="top" style={{ fill: "#f39c12", fontSize: 10 }} formatter={(v: any) => `${v}s`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ color: "#7d8694", fontSize: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
        慢路径 M3=60s，快路径 M4=38s。Case01 严格交替，两条路径样本各占一半；Case02 看 RCT 选最优，
        样本数会向"当时更空闲的那条"倾斜，平均耗时也更稳定。
      </div>
    </div>
  );
});

function RouteCard({ title, color, s }: { title: string; color: string; s: { count: number; avg: number; min: number; max: number; p50: number } }) {
  return (
    <div
      style={{
        flex: 1,
        background: "#0c0e13",
        border: "1px solid #1c2128",
        borderLeft: `2px solid ${color}`,
        padding: "6px 10px",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
    >
      <div style={{ color: "#7d8694", fontSize: 10, letterSpacing: 1 }}>{title}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <KV k="n" v={s.count} color={color} />
        <KV k="avg" v={`${s.avg.toFixed(1)}s`} color={color} />
        <KV k="p50" v={`${s.p50.toFixed(0)}s`} color="#a6adb8" />
        <KV k="min" v={`${s.min.toFixed(0)}s`} color="#a6adb8" />
        <KV k="max" v={`${s.max.toFixed(0)}s`} color="#a6adb8" />
      </div>
    </div>
  );
}

function KV({ k, v, color }: { k: string; v: number | string; color: string }) {
  return (
    <div>
      <div style={{ color: "#5c6370", fontSize: 9 }}>{k}</div>
      <div style={{ color, fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    </div>
  );
}
