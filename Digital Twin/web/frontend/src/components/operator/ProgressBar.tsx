import { ProgressBar as BPProgressBar } from "@blueprintjs/core";
import type { TaskState } from "../../api";

interface Props {
  task: TaskState | null;
}

export function JobProgress({ task }: Props) {
  if (!task) return null;

  const intent =
    task.status === "error" ? "danger" : task.status === "done" ? "success" : "primary";

  const pct = Math.round(task.progress * 100);
  const elapsed = Math.round((task.updated_ts - task.created_ts) * 10) / 10;

  return (
    <div
      style={{
        background: "#0c0e13",
        border: "1px solid #1c2128",
        padding: "10px 14px",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            padding: "2px 8px",
            border: `1px solid ${intent === "danger" ? "#e74c3c" : intent === "success" ? "#2ecc71" : "#5ba8ff"}`,
            color: intent === "danger" ? "#e74c3c" : intent === "success" ? "#2ecc71" : "#5ba8ff",
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          {task.status.toUpperCase()}
        </span>
        <span style={{ color: "#a6adb8", fontSize: 11 }}>{task.stage}</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "#7d8694", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>
          {pct}% · {elapsed}s
        </span>
      </div>
      <BPProgressBar
        intent={intent}
        value={task.progress}
        animate={task.status === "running"}
        stripes={task.status === "running"}
      />
      {task.error && (
        <div style={{ color: "#ff8a8a", fontSize: 11, marginTop: 4 }}>{task.error}</div>
      )}
      <div style={{ color: "#5c6370", fontSize: 10 }}>
        task_id = <span style={{ color: "#7d8694" }}>{task.id}</span>
      </div>
    </div>
  );
}
