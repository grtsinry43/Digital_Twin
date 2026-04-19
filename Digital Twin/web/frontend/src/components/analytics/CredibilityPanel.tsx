import { memo, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { SimEvent } from "../../types";
import type { Analytics } from "../../analytics";
import { deriveCredibility } from "../../credibility";

const AXIS = { stroke: "#5c6370", fontSize: 11, fontFamily: "ui-monospace, 'SF Mono', monospace" };

interface Props {
  analyticsB: Analytics;
  eventsB: SimEvent[];
  compact?: boolean; // 调度页用紧凑版（2 小图 + 汇总）
}

export const CredibilityPanel = memo(function CredibilityPanel({ analyticsB, eventsB, compact = false }: Props) {
  const cred = useMemo(() => {
    const gains = eventsB
      .filter((e) => e.type === "decision_end" && e.applied)
      .map((e: any) => e.gain_pct as number);
    return deriveCredibility(analyticsB, gains);
  }, [analyticsB, eventsB]);

  const stats = (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Stat label="样本" v={cred.n} color="#a6adb8" />
      <Stat label="MAE" v={`${cred.mae.toFixed(2)}s`} color="#5ba8ff" />
      <Stat label="RMSE" v={`${cred.rmse.toFixed(2)}s`} color="#f39c12" />
      <Stat
        label="偏差 (pred−act)"
        v={`${cred.bias >= 0 ? "+" : ""}${cred.bias.toFixed(2)}s`}
        color={Math.abs(cred.bias) < 5 ? "#2ecc71" : "#e74c3c"}
      />
      <VerdictTag mae={cred.mae} bias={cred.bias} />
    </div>
  );

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {stats}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, height: 140 }}>
          <MiniPanel title="滚动 MAE (最近 20 次)">
            <RollingMae data={cred.rollingMae} />
          </MiniPanel>
          <MiniPanel title="|gain%| 分布（越右越有把握）">
            <ConfidenceHist data={cred.confidenceBuckets} />
          </MiniPanel>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {stats}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        <MiniPanel title="滚动 MAE（窗口=20）">
          <RollingMae data={cred.rollingMae} />
        </MiniPanel>
        <MiniPanel title="残差（pred − actual） 越贴近 0 越准">
          <Residuals data={cred.residuals} />
        </MiniPanel>
        <MiniPanel title="决策置信度 |gain%| 分布">
          <ConfidenceHist data={cred.confidenceBuckets} />
        </MiniPanel>
      </div>
      <div style={{ color: "#7d8694", fontSize: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
        滚动 MAE 若持续上升说明孪生与现场脱节；偏差长期不在 0 附近说明系统性偏置；低 gain% 决策占比高说明很多决策其实没什么把握。
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

function VerdictTag({ mae, bias }: { mae: number; bias: number }) {
  const absBias = Math.abs(bias);
  let label = "可信", color = "#2ecc71";
  if (mae > 60 || absBias > 20) {
    label = "需重标定";
    color = "#e74c3c";
  } else if (mae > 30 || absBias > 10) {
    label = "有偏差";
    color = "#f39c12";
  }
  return (
    <div
      style={{
        padding: "2px 10px",
        border: `1px solid ${color}`,
        color,
        fontSize: 11,
        letterSpacing: 1,
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
    >
      孪生判定 · {label}
    </div>
  );
}

function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0c0e13", border: "1px solid #1c2128", padding: 8, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ color: "#7d8694", fontSize: 10, marginBottom: 4, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>{title}</div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function RollingMae({ data }: { data: { t: number; mae: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
        <XAxis dataKey="t" {...AXIS} />
        <YAxis {...AXIS} unit="s" />
        <Tooltip contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 11 }} />
        <Line type="monotone" dataKey="mae" stroke="#5ba8ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Residuals({ data }: { data: { t: number; residual: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
        <XAxis type="number" dataKey="t" {...AXIS} />
        <YAxis type="number" dataKey="residual" {...AXIS} unit="s" />
        <ZAxis range={[30, 30]} />
        <ReferenceLine y={0} stroke="#5c6370" strokeDasharray="3 4" />
        <Tooltip contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 11 }} />
        <Scatter data={data} fill="#f39c12" fillOpacity={0.7} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ConfidenceHist({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="count" name="决策次数" fill="#2ecc71" isAnimationActive={false}>
          <LabelList dataKey="count" position="top" style={{ fill: "#2ecc71", fontSize: 10 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
