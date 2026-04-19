import { memo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analytics } from "../../analytics";

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

interface Props {
  a: Analytics;
  b: Analytics;
}

export const UtilizationChart = memo(function UtilizationChart({ a, b }: Props) {
  const machines = a.utilization.map((u) => u.machineId);
  const data = machines.map((mid) => {
    const uA = a.utilization.find((u) => u.machineId === mid)!;
    const uB = b.utilization.find((u) => u.machineId === mid)!;
    return {
      name: `M${mid}`,
      Case01: +uA.pct.toFixed(1),
      Case02: +uB.pct.toFixed(1),
      A_ops: uA.opCount,
      B_ops: uB.opCount,
    };
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>
        机器利用率（busy_time / horizon · %）· 数字是两 Case 对比
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 12 }}
              labelStyle={{ color: "#a6adb8" }}
              formatter={(v: any, _n: any, payload: any) => {
                const ops = payload.dataKey === "Case01" ? payload.payload.A_ops : payload.payload.B_ops;
                return [`${v}%  (${ops} ops)`, payload.dataKey];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Case01" fill="#5ba8ff" isAnimationActive={false}>
              <LabelList dataKey="Case01" position="top" style={{ fill: "#5ba8ff", fontSize: 10 }} formatter={(v: any) => `${v}%`} />
            </Bar>
            <Bar dataKey="Case02" fill="#f39c12" isAnimationActive={false}>
              <LabelList dataKey="Case02" position="top" style={{ fill: "#f39c12", fontSize: 10 }} formatter={(v: any) => `${v}%`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ color: "#7d8694", fontSize: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
        M3（60s）是瓶颈：它的利用率天然最高；Case02 通过把更多零件送给 M4（38s）让两者更均衡。
      </div>
    </div>
  );
});
