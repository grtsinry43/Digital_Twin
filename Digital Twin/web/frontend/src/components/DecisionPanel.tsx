import { Callout, Tag } from "@blueprintjs/core";
import type { WorldState } from "../playback/world";

export function DecisionPanel({ world }: { world: WorldState }) {
  const d = world.activeDecision;
  const thinking = world.thinking;

  if (thinking && !d) {
    return (
      <Callout intent="warning" icon="predictive-analysis" title={`孪生思考中 · Part ${thinking.part_id}`}>
        分叉 B{thinking.branch_id} · 候选路径 {thinking.options.map((o) => `Q${o}`).join(" / ")}
      </Callout>
    );
  }

  if (!d) {
    return (
      <Callout icon="flash" title="等待分叉决策">
        <span style={{ color: "#7d8694" }}>零件抵达 M2 分叉时，孪生会预测每条路径的 RCT。</span>
      </Callout>
    );
  }

  const paths = Object.entries(d.rcts).map(([cid, rct]) => ({
    cid: Number(cid),
    rct: Number(rct),
    chosen: Number(cid) === d.chosen,
  }));
  const maxRct = Math.max(...paths.map((p) => p.rct));

  return (
    <div style={{ fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>T={d.t.toFixed(0)}</span>
        <span style={{ color: "#e6e8eb", fontSize: 13, fontWeight: 600 }}>Part {d.part_id}</span>
        <Tag intent={d.applied ? "success" : "none"} minimal>
          {d.applied ? "已下发" : "未下发"}
        </Tag>
        <span style={{ flex: 1 }} />
        <Tag intent="primary" large style={{ fontVariantNumeric: "tabular-nums" }}>
          gain {d.gain_pct.toFixed(1)}%
        </Tag>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {paths.map((p) => {
          const w = (p.rct / maxRct) * 100;
          return (
            <div key={p.cid}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "#a6adb8", marginBottom: 4 }}>
                <span style={{ width: 50 }}>Q{p.cid}</span>
                <span style={{ flex: 1 }}>预测 RCT = {p.rct}s</span>
                {p.chosen && <Tag intent="success" minimal>已选</Tag>}
              </div>
              <div
                style={{
                  height: 8,
                  background: "#1c2a3a",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${w}%`,
                    height: "100%",
                    background: p.chosen
                      ? "linear-gradient(90deg, #2ecc71, #58e896)"
                      : "#3a4452",
                    transition: "width 300ms ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, borderTop: "1px dashed #262c38", paddingTop: 10 }}>
        <div style={{ color: "#7d8694", fontSize: 11, marginBottom: 6, letterSpacing: 1 }}>最近决策</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflow: "auto" }}>
          {world.recentDecisions.slice(0, 8).map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 8,
                fontSize: 11,
                color: r === d ? "#e6e8eb" : "#7d8694",
              }}
            >
              <span style={{ color: "#5c6370", width: 42 }}>t={r.t.toFixed(0)}</span>
              <span style={{ width: 54 }}>P{r.part_id}</span>
              <span style={{ width: 36 }}>→Q{r.chosen}</span>
              <span>{r.gain_pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
