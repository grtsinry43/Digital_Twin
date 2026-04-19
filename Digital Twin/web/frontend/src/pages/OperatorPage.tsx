import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@blueprintjs/core";
import {
  api,
  type Intervention,
  type SimulateAsyncResult,
  type SimulateParams,
  type TaskState,
} from "../api";
import type { SimEvent, Topology } from "../types";
import { derive } from "../analytics";
import { ParamForm } from "../components/operator/ParamForm";
import { ResultPanel } from "../components/operator/ResultPanel";
import { InterventionLog } from "../components/operator/InterventionLog";
import { JobProgress } from "../components/operator/ProgressBar";
import { CredibilityPanel } from "../components/analytics/CredibilityPanel";

interface Props {
  topology: Topology;
  evA: SimEvent[];
  evB: SimEvent[];
}

interface PendingMeta { operator: string; note: string; params: SimulateParams }

export function OperatorPage({ topology, evB }: Props) {
  const analyticsB = useMemo(() => derive(evB, topology), [evB, topology]);
  const [task, setTask] = useState<TaskState | null>(null);
  const [result, setResult] = useState<SimulateAsyncResult | null>(null);
  const [logs, setLogs] = useState<Intervention[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const pendingRef = useRef<PendingMeta | null>(null);
  const writtenTaskIds = useRef(new Set<string>());

  useEffect(() => {
    api.interventions().then(setLogs).catch(() => {});
  }, []);

  // 轮询：只在有"未完成"任务时运转
  useEffect(() => {
    if (!task || task.status === "done" || task.status === "error") return;
    const id = window.setInterval(async () => {
      try {
        const s = await api.simulateStatus(task.id);
        setTask(s);
      } catch (e: any) {
        setErr(String(e.message ?? e));
        clearInterval(id);
      }
    }, 800);
    return () => clearInterval(id);
  }, [task?.id, task?.status]);

  // 任务完成 → 保存结果 + 写审计日志（幂等：同 task_id 只写一次）
  useEffect(() => {
    if (!task || task.status !== "done" || !task.result) return;
    if (writtenTaskIds.current.has(task.id)) return;
    writtenTaskIds.current.add(task.id);

    setResult(task.result);
    const meta = pendingRef.current;
    if (meta) {
      api
        .postIntervention({
          operator: meta.operator,
          params: meta.params,
          kpi_before: task.result.baseline.kpi,
          kpi_after: task.result.baseline.kpi,
          kpi_twin: task.result.twin.kpi,
          gain: task.result.gain,
          note: meta.note,
        })
        .then(() => api.interventions())
        .then(setLogs)
        .catch((e) => setErr(String(e.message ?? e)));
    }
  }, [task]);

  useEffect(() => {
    if (task?.status === "error") setErr(task.error ?? "任务失败");
  }, [task?.status, task?.error]);

  const running = task?.status === "pending" || task?.status === "running";

  const submit = useCallback(
    async (params: SimulateParams, operator: string, note: string) => {
      setErr(null);
      setResult(null);
      pendingRef.current = { operator, note, params };
      try {
        const { task_id } = await api.simulateAsync(params);
        const initial = await api.simulateStatus(task_id);
        setTask(initial);
      } catch (e: any) {
        setErr(String(e.message ?? e));
      }
    },
    [],
  );

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <Banner />

      <Section title="孪生可信度 · 调度前先看这个">
        <CredibilityPanel analyticsB={analyticsB} eventsB={evB} compact />
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(520px, 1.4fr)", gap: 8 }}>
        <Section title="参数调整 · WHAT-IF">
          <ParamForm onSubmit={submit} running={running} />
          {err && (
            <div style={{ marginTop: 8, padding: 8, background: "#2a1618", border: "1px solid #5a1e22", color: "#ff8a8a", fontSize: 11 }}>
              {err}
            </div>
          )}
        </Section>

        <Section title="仿真结果 · 基线 vs 孪生">
          {(task || result) && (
            <div style={{ marginBottom: 8 }}>
              <JobProgress task={task} />
            </div>
          )}
          <ResultPanel result={result} />
        </Section>
      </div>

      <Section title="干预审计日志">
        <InterventionLog logs={logs} />
      </Section>
    </div>
  );
}

function Banner() {
  return (
    <div
      style={{
        padding: "6px 12px",
        background: "rgba(243,156,18,0.08)",
        border: "1px solid rgba(243,156,18,0.3)",
        color: "#f39c12",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        fontSize: 11,
        letterSpacing: 1,
      }}
    >
      调度/决策端 · 每次"运行"都会并行跑两次仿真（无孪生 baseline + 论文 RCT 贪心），对比展示孪生增益；任务异步执行，请等候进度条
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card
      style={{
        background: "#0f1218",
        border: "1px solid #262c38",
        padding: 0,
        boxShadow: "none",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontSize: 11,
          letterSpacing: 1,
          color: "#a6adb8",
          borderBottom: "1px solid #1c2128",
          background: "#0c0e13",
        }}
      >
        {title}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </Card>
  );
}
