import { memo, useMemo, useState } from "react";
import { SegmentedControl } from "@blueprintjs/core";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analytics } from "../../analytics";

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

interface Props {
  a: Analytics;
  b: Analytics;
  queueIds: number[];
}

// 把稀疏的 {t, len} 样本按时间对齐成 Recharts 友好的行
function buildSeries(
  aSeries: { t: number; len: number }[],
  bSeries: { t: number; len: number }[],
): { t: number; A: number; B: number }[] {
  const allTs = new Set<number>();
  aSeries.forEach((p) => allTs.add(p.t));
  bSeries.forEach((p) => allTs.add(p.t));
  const ts = [...allTs].sort((x, y) => x - y);
  let aIdx = 0;
  let bIdx = 0;
  let lastA = aSeries[0]?.len ?? 0;
  let lastB = bSeries[0]?.len ?? 0;
  const out: { t: number; A: number; B: number }[] = [];
  for (const t of ts) {
    while (aIdx < aSeries.length && aSeries[aIdx].t <= t) {
      lastA = aSeries[aIdx].len;
      aIdx++;
    }
    while (bIdx < bSeries.length && bSeries[bIdx].t <= t) {
      lastB = bSeries[bIdx].len;
      bIdx++;
    }
    out.push({ t, A: lastA, B: lastB });
  }
  return out;
}

export const QueueLengthChart = memo(function QueueLengthChart({ a, b, queueIds }: Props) {
  const [selected, setSelected] = useState<string>(String(queueIds[2] ?? queueIds[0])); // 默认 Q3

  const options = queueIds.map((id) => ({ label: labelOf(id), value: String(id) }));
  const qid = Number(selected);

  const data = useMemo(() => {
    return buildSeries(a.queueLen.get(qid) ?? [], b.queueLen.get(qid) ?? []);
  }, [a, b, qid]);

  const avgA = data.length ? data.reduce((s, r) => s + r.A, 0) / data.length : 0;
  const avgB = data.length ? data.reduce((s, r) => s + r.B, 0) / data.length : 0;
  const maxA = Math.max(0, ...data.map((r) => r.A));
  const maxB = Math.max(0, ...data.map((r) => r.B));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>选择队列</span>
        <SegmentedControl small options={options} value={selected} onValueChange={(v) => setSelected(String(v))} />
        <div style={{ flex: 1 }} />
        <Stat label="Case01 均值" v={avgA.toFixed(2)} color="#5ba8ff" />
        <Stat label="Case01 峰值" v={maxA} color="#5ba8ff" />
        <Stat label="Case02 均值" v={avgB.toFixed(2)} color="#f39c12" />
        <Stat label="Case02 峰值" v={maxB} color="#f39c12" />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
            <XAxis dataKey="t" {...AXIS} label={{ value: "仿真时间 t", position: "insideBottom", offset: -2, fill: "#5c6370", fontSize: 10 }} />
            <YAxis {...AXIS} label={{ value: "等待零件数", angle: -90, position: "insideLeft", fill: "#5c6370", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 12 }} labelStyle={{ color: "#a6adb8" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="stepAfter" dataKey="A" stroke="#5ba8ff" strokeWidth={1.5} dot={false} name="Case01" isAnimationActive={false} />
            <Line type="stepAfter" dataKey="B" stroke="#f39c12" strokeWidth={1.5} dot={false} name="Case02" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ color: "#7d8694", fontSize: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
        {hintOf(qid)}
      </div>
    </div>
  );
});

function labelOf(id: number) {
  const names: Record<number, string> = {
    1: "Q1 · M5→M1 (回环)",
    2: "Q2 · M1→M2",
    3: "Q3 · M2→M3 (慢路径)",
    4: "Q4 · M2→M4 (快路径)",
    5: "Q5 · {M3,M4}→M5",
  };
  return names[id] ?? `Q${id}`;
}

function hintOf(id: number) {
  if (id === 3) return "Q3 是送往慢机器 M3 的入口。Case01 这条队经常堵长，Case02 被孪生决策主动避开，大多保持低位。";
  if (id === 4) return "Q4 是送往快机器 M4 的入口。Case02 更常用它，队列会相对长一些，但因 M4 处理快并不堆积。";
  if (id === 5) return "Q5 是汇流队列，两台分支机器的输出都涌入 M5 之前。";
  if (id === 1) return "Q1 是 M5→M1 闭环回传。零件总数守恒，闭环堆积反映整体 WIP 分布。";
  if (id === 2) return "Q2 是 M2 的入口队列，反映 M2 前等待加工的零件数。";
  return "";
}

function Stat({ label, v, color }: { label: string; v: number | string; color: string }) {
  return (
    <div style={{ fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <div style={{ color: "#5c6370", fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    </div>
  );
}
