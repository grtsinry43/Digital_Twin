import { useMemo } from "react";
import type { SimEvent } from "../types";

interface Props {
  eventsB: SimEvent[];
  tSim: number;
}

export function MqttLog({ eventsB, tSim }: Props) {
  const lines = useMemo(() => {
    const out: { t: number; topic: string; payload: string; color: string }[] = [];
    for (const e of eventsB) {
      if (e.t > tSim) break;
      if (e.type === "decision_start") {
        out.push({
          t: e.t,
          topic: "twin/thinking",
          payload: `{"part":${e.part_id},"options":[${e.options.join(",")}]}`,
          color: "#f39c12",
        });
      } else if (e.type === "decision_end" && e.applied) {
        out.push({
          t: e.t,
          topic: "twin → physical",
          payload: `{"part":${e.part_id},"route":"Q${e.chosen_conveyor_id}","gain":"${e.gain_pct.toFixed(1)}%"}`,
          color: "#2ecc71",
        });
      } else if (e.type === "terminate" && out.length < 200) {
        out.push({
          t: e.t,
          topic: "physical/terminate",
          payload: `{"part":${e.part_id},"ct":${e.cycle_time}}`,
          color: "#5ba8ff",
        });
      }
    }
    return out.slice(-80).reverse();
  }, [eventsB, tSim]);

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        fontSize: 11,
        padding: "8px 12px",
        background: "#0c0e13",
      }}
    >
      <div style={{ color: "#7d8694", letterSpacing: 1, fontSize: 10, marginBottom: 6 }}>
        MQTT BUS (SIMULATED)
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 10, padding: "2px 0", color: "#c9d1d9" }}>
          <span style={{ color: "#5c6370", width: 50 }}>t={l.t.toFixed(0)}</span>
          <span style={{ color: l.color, width: 140 }}>{l.topic}</span>
          <span style={{ color: "#a6adb8" }}>{l.payload}</span>
        </div>
      ))}
      {lines.length === 0 && (
        <div style={{ color: "#5c6370", fontStyle: "italic" }}>等待事件…</div>
      )}
    </div>
  );
}
