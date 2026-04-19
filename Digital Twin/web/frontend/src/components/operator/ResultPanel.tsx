import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimulateAsyncResult } from "../../api";

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

interface Props {
  result: SimulateAsyncResult | null;
}

export function ResultPanel({ result }: Props) {
  if (!result) {
    return (
      <div style={{ padding: 24, color: "#5c6370", fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: 11 }}>
        还未运行 · 修改左侧参数后点"运行 What-if"
      </div>
    );
  }

  const { baseline, twin, gain, params } = result;

  const utilData = baseline.utilization.map((u, i) => ({
    name: `M${u.machine_id}`,
    baseline: u.pct,
    twin: twin.utilization[i]?.pct ?? 0,
  }));

  const verdict = twin.kpi.avg_ct < baseline.kpi.avg_ct
    ? { text: "孪生调度显著优于基线", color: "#2ecc71" }
    : twin.kpi.avg_ct > baseline.kpi.avg_ct * 1.02
    ? { text: "孪生无明显收益（本轮）", color: "#e74c3c" }
    : { text: "孪生与基线接近", color: "#f39c12" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <div style={{
        padding: "8px 12px",
        border: `1px solid ${verdict.color}`,
        color: verdict.color,
        fontSize: 12,
        letterSpacing: 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{ fontWeight: 600 }}>孪生判定</span>
        <span>·</span>
        <span>{verdict.text}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "#7d8694" }}>
          horizon={params.horizon}s · baseline {baseline.wall_seconds}s + twin {twin.wall_seconds}s · {twin.decisions} 次决策
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <KpiColumn
          title="基线 (无孪生)"
          color="#7d8694"
          kpi={baseline.kpi}
        />
        <KpiColumn
          title="用孪生 (RCT 贪心)"
          color="#2ecc71"
          kpi={twin.kpi}
        />
        <GainColumn gain={gain} />
      </div>

      <div style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>
        机器利用率对比（baseline vs twin）
      </div>
      <div style={{ height: 200, background: "#0c0e13", border: "1px solid #1c2128", padding: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={utilData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="baseline" name="基线" fill="#7d8694" isAnimationActive={false}>
              <LabelList dataKey="baseline" position="top" style={{ fill: "#7d8694", fontSize: 10 }} formatter={(v: any) => `${v}%`} />
            </Bar>
            <Bar dataKey="twin" name="孪生" fill="#2ecc71" isAnimationActive={false}>
              <LabelList dataKey="twin" position="top" style={{ fill: "#2ecc71", fontSize: 10 }} formatter={(v: any) => `${v}%`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KpiColumn({ title, color, kpi }: { title: string; color: string; kpi: { count: number; avg_ct: number; throughput: number; min_ct: number; max_ct: number; last_t: number } }) {
  return (
    <div style={{ background: "#0c0e13", border: "1px solid #1c2128", borderLeft: `3px solid ${color}`, padding: "10px 14px" }}>
      <div style={{ color, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      <Row label="完成数" v={kpi.count} />
      <Row label="平均 CT" v={`${kpi.avg_ct.toFixed(1)}s`} />
      <Row label="吞吐率" v={kpi.throughput.toFixed(4)} />
      <Row label="CT 范围" v={`${kpi.min_ct}–${kpi.max_ct}s`} />
    </div>
  );
}

function GainColumn({ gain }: { gain: { delta_avg_ct: number; delta_avg_ct_pct: number; delta_throughput: number; delta_throughput_pct: number; delta_count: number } }) {
  const ctGood = gain.delta_avg_ct < 0;
  const thGood = gain.delta_throughput > 0;
  return (
    <div
      style={{
        background: "rgba(46,204,113,0.04)",
        border: "1px solid rgba(46,204,113,0.3)",
        borderLeft: "3px solid #2ecc71",
        padding: "10px 14px",
      }}
    >
      <div style={{ color: "#2ecc71", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>孪生增益 (twin − baseline)</div>
      <Row label="Δ CT" v={`${gain.delta_avg_ct > 0 ? "+" : ""}${gain.delta_avg_ct.toFixed(1)}s`} color={ctGood ? "#2ecc71" : "#e74c3c"} sub={`${gain.delta_avg_ct_pct >= 0 ? "+" : ""}${gain.delta_avg_ct_pct.toFixed(1)}%`} />
      <Row label="Δ 吞吐" v={`${gain.delta_throughput > 0 ? "+" : ""}${gain.delta_throughput.toFixed(4)}`} color={thGood ? "#2ecc71" : "#e74c3c"} sub={`${gain.delta_throughput_pct >= 0 ? "+" : ""}${gain.delta_throughput_pct.toFixed(1)}%`} />
      <Row label="Δ 完成数" v={`${gain.delta_count > 0 ? "+" : ""}${gain.delta_count}`} color={gain.delta_count >= 0 ? "#2ecc71" : "#e74c3c"} />
    </div>
  );
}

function Row({ label, v, color = "#e6e8eb", sub }: { label: string; v: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 0" }}>
      <span style={{ color: "#5c6370", fontSize: 10, width: 64 }}>{label}</span>
      <span style={{ color, fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</span>
      {sub && <span style={{ color, opacity: 0.7, fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{sub}</span>}
    </div>
  );
}
