import { HTMLTable, Tag } from "@blueprintjs/core";
import type { Intervention, SimulateParams } from "../../api";

const BASELINE: SimulateParams = {
  m3_time: 60,
  m4_time: 38,
  q3_capacity: 10,
  q4_capacity: 10,
  policy: "alternated",
  horizon: 2000,
};

interface Props {
  logs: Intervention[];
}

function paramDiff(p: SimulateParams): string[] {
  const out: string[] = [];
  for (const k of Object.keys(BASELINE) as (keyof SimulateParams)[]) {
    if (p[k] !== BASELINE[k]) out.push(`${k}: ${BASELINE[k]} → ${p[k]}`);
  }
  return out;
}

function ts(t: number) {
  const d = new Date(t);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export function InterventionLog({ logs }: Props) {
  if (!logs.length) {
    return (
      <div style={{ padding: 24, color: "#5c6370", fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: 11 }}>
        尚无历史干预
      </div>
    );
  }
  return (
    <div style={{ overflow: "auto", maxHeight: 420, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <HTMLTable compact interactive striped style={{ width: "100%", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ color: "#a6adb8" }}>#</th>
            <th style={{ color: "#a6adb8" }}>时间</th>
            <th style={{ color: "#a6adb8" }}>操作员</th>
            <th style={{ color: "#a6adb8" }}>参数变更</th>
            <th style={{ color: "#a6adb8" }}>基线 CT</th>
            <th style={{ color: "#a6adb8" }}>孪生 CT</th>
            <th style={{ color: "#a6adb8" }}>孪生增益</th>
            <th style={{ color: "#a6adb8" }}>备注</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r) => {
            const diff = paramDiff(r.params);
            const ctBase = r.kpi_after.avg_ct;
            const ctTwin = r.kpi_twin?.avg_ct;
            const gain = r.gain;
            const gainGood = gain ? gain.delta_avg_ct < 0 : null;
            return (
              <tr key={r.id}>
                <td style={{ color: "#7d8694" }}>{r.id}</td>
                <td style={{ color: "#a6adb8" }}>{ts(r.ts)}</td>
                <td>
                  <Tag minimal>{r.operator}</Tag>
                </td>
                <td>
                  {diff.length === 0 ? (
                    <span style={{ color: "#5c6370" }}>（基线）</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {diff.map((d) => (
                        <Tag key={d} minimal intent="warning">
                          {d}
                        </Tag>
                      ))}
                    </div>
                  )}
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums", color: "#7d8694" }}>
                  {ctBase.toFixed(1)}s
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {ctTwin != null ? (
                    <span style={{ color: "#2ecc71", fontWeight: 600 }}>{ctTwin.toFixed(1)}s</span>
                  ) : (
                    <span style={{ color: "#5c6370" }}>—</span>
                  )}
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>
                  {gain ? (
                    <Tag minimal intent={gainGood ? "success" : "danger"}>
                      {gain.delta_avg_ct > 0 ? "+" : ""}
                      {gain.delta_avg_ct.toFixed(1)}s
                      {"  "}({gain.delta_avg_ct_pct >= 0 ? "+" : ""}
                      {gain.delta_avg_ct_pct.toFixed(1)}%)
                    </Tag>
                  ) : (
                    <span style={{ color: "#5c6370" }}>—</span>
                  )}
                </td>
                <td style={{ color: "#a6adb8", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{r.note || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </HTMLTable>
    </div>
  );
}
