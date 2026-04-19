import { memo, useMemo } from "react";
import { CartesianGrid, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ComposedChart } from "recharts";
import type { Analytics } from "../../analytics";

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

interface Props {
  b: Analytics; // 只有 Case02 有决策
}

export const PredictionChart = memo(function PredictionChart({ b }: Props) {
  const scatter = useMemo(
    () => b.predictionVsActual.map((p) => ({ predicted: +p.predictedChosen.toFixed(1), actual: +p.actual.toFixed(1) })),
    [b],
  );

  const series = useMemo(
    () =>
      b.predictionVsActual
        .slice()
        .sort((x, y) => x.t - y.t)
        .map((p) => ({
          t: p.t,
          chosen: +p.predictedChosen.toFixed(1),
          other: +p.predictedOther.toFixed(1),
          actual: +p.actual.toFixed(1),
        })),
    [b],
  );

  const maxV = Math.max(
    1,
    ...scatter.map((p) => Math.max(p.predicted, p.actual)),
  );

  const errs = scatter.map((p) => Math.abs(p.predicted - p.actual));
  const mae = errs.length ? errs.reduce((s, x) => s + x, 0) / errs.length : 0;
  const rmse = errs.length ? Math.sqrt(errs.reduce((s, x) => s + x * x, 0) / errs.length) : 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>RCT 预测 vs 实际剩余周期</span>
        <div style={{ flex: 1 }} />
        <Stat label="样本" v={scatter.length} color="#a6adb8" />
        <Stat label="MAE" v={`${mae.toFixed(2)}s`} color="#5ba8ff" />
        <Stat label="RMSE" v={`${rmse.toFixed(2)}s`} color="#f39c12" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        <div style={{ background: "#0c0e13", border: "1px solid #1c2128", padding: 8, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#7d8694", fontSize: 10, marginBottom: 4 }}>散点：横轴预测 RCT，纵轴实际耗时（虚线 y=x 是完美预测）</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
                <XAxis type="number" dataKey="predicted" name="预测" unit="s" domain={[0, maxV]} {...AXIS} />
                <YAxis type="number" dataKey="actual" name="实际" unit="s" domain={[0, maxV]} {...AXIS} />
                <ZAxis range={[40, 40]} />
                <Tooltip
                  cursor={{ stroke: "#3a4048", strokeDasharray: "3 3" }}
                  contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 12 }}
                />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: maxV, y: maxV },
                  ]}
                  stroke="#5c6370"
                  strokeDasharray="3 4"
                />
                <Scatter data={scatter} fill="#2ecc71" fillOpacity={0.7} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: "#0c0e13", border: "1px solid #1c2128", padding: 8, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#7d8694", fontSize: 10, marginBottom: 4 }}>逐次决策：被选 vs 被弃 的预测 RCT，叠加实际耗时</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
                <XAxis dataKey="t" {...AXIS} />
                <YAxis {...AXIS} unit="s" />
                <Tooltip
                  contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 12 }}
                  labelStyle={{ color: "#a6adb8" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="chosen" stroke="#2ecc71" strokeWidth={1.5} dot={false} name="预测·被选" isAnimationActive={false} />
                <Line type="monotone" dataKey="other" stroke="#f06" strokeWidth={1.2} dot={false} strokeDasharray="3 3" name="预测·被弃" isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" stroke="#f39c12" strokeWidth={1} dot={{ r: 1.5 }} name="实际" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ color: "#7d8694", fontSize: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
        散点越贴近虚线表示 RCT 预测越准；右图绿线（被选）若一直低于红虚线（被弃），说明孪生总挑预测更短的那条。
      </div>
    </div>
  );
});

function Stat({ label, v, color }: { label: string; v: number | string; color: string }) {
  return (
    <div style={{ fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <div style={{ color: "#5c6370", fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    </div>
  );
}
