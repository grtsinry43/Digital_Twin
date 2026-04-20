import type { EventsPayload, KPI, Topology } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function j<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `${path} → ${r.status}`;
    try {
      const j = await r.json();
      if (j.detail) detail = j.detail;
    } catch {}
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

// —— What-if ——
export interface SimulateParams {
  m3_time: number;
  m4_time: number;
  q3_capacity: number;
  q4_capacity: number;
  policy: "alternated" | "first";
  horizon: number;
}
export interface SimulateKPI {
  count: number;
  avg_ct: number;
  min_ct: number;
  max_ct: number;
  throughput: number;
  last_t: number;
}
export interface SimulateResult {
  request: SimulateParams;
  kpi: SimulateKPI;
  utilization: { machine_id: number; busy: number; pct: number }[];
  wall_seconds: number;
  events_count: number;
}
export interface SimulateBounds {
  bounds: Record<string, [number, number]>;
  policies: string[];
}

// —— 异步任务 ——
export interface SimulateRunResult {
  kpi: SimulateKPI;
  utilization: { machine_id: number; busy: number; pct: number }[];
  wall_seconds: number;
  events_count: number;
  decisions: number;
}
export interface SimulateGain {
  delta_avg_ct: number;
  delta_avg_ct_pct: number;
  delta_throughput: number;
  delta_throughput_pct: number;
  delta_count: number;
}
export interface SimulateAsyncResult {
  params: SimulateParams;
  baseline: SimulateRunResult;
  twin: SimulateRunResult;
  gain: SimulateGain;
}
export interface TaskState {
  id: string;
  status: "pending" | "running" | "done" | "error";
  stage: string;
  progress: number; // 0..1
  params: SimulateParams;
  created_ts: number;
  updated_ts: number;
  result: SimulateAsyncResult | null;
  error: string | null;
  traceback?: string;
}

// —— 干预日志 ——
export interface Intervention {
  id: number;
  ts: number;
  operator: string;
  params: SimulateParams;
  kpi_before: SimulateKPI | null;
  kpi_after: SimulateKPI;
  kpi_twin?: SimulateKPI | null;
  gain?: SimulateGain | null;
  note: string;
}

// —— 效率感知 ——
export interface EfficiencyMachine {
  machine_id: number;
  label: string;
  nominal: number;
  measured_mean: number;
  measured_median: number;
  std: number;
  n: number;
  ci_low: number;
  ci_high: number;
  delta_pct: number;
  direction: "slower" | "faster" | "flat";
  significant: boolean;
  state: "ok" | "watch" | "drift";
  changepoint_t: number | null;
  rolling: { t: number; mean: number }[];
  tunable: boolean;
}
export interface EfficiencyCandidate {
  machine_id: number;
  label: string;
  kind: string;
  param: string;
  from: number;
  to: number;
  delta_pct: number;
  direction: "slower" | "faster" | "flat";
  reason: string;
  evidence: Record<string, any>;
}
export interface EfficiencyStatus {
  case: string;
  thresholds: { sig_pct: number; watch_pct: number; min_samples: number; window_last: number };
  machines: EfficiencyMachine[];
  candidate_suggestions: EfficiencyCandidate[];
}
export interface Suggestion extends EfficiencyCandidate {
  id: number;
  ts: number;
  status: "pending" | "approved" | "rejected" | "modified" | "ignored";
  case: string;
  decided_by?: string;
  decided_ts?: number;
  decide_note?: string;
  applied_to?: number | null;
}
export interface DecidePayload {
  action: "approve" | "reject" | "modify" | "ignore";
  operator: string;
  note?: string;
  new_to?: number;
}

export interface AutoConfig {
  enabled: boolean;
  mode: "manual" | "auto";
  case: string;
  interval_s: number;
  max_auto_pct: number;
  cooldown_s: number;
  dedup_window_s: number;
  kill_ts: number | null;
}
export interface AutoTickResult {
  ts: number;
  cfg: AutoConfig;
  added: number;
  applied: Suggestion[];
  skipped: { id: number; reason: string }[];
  note: string | null;
}
export interface AutoState {
  cfg: AutoConfig;
  last_tick_ts: number | null;
  applied_count: number;
  last_result: AutoTickResult | null;
  worker_running: boolean;
}

export const api = {
  topology: () => j<Topology>("/api/topology"),
  events: (c: "01" | "02") => j<EventsPayload>(`/api/events?case=${c}`),
  kpi: () => j<Record<string, KPI>>("/api/kpi"),
  simulateBounds: () => j<SimulateBounds>("/api/simulate/bounds"),
  simulate: (p: SimulateParams) => post<SimulateResult>("/api/simulate", p),
  simulateAsync: (p: SimulateParams) => post<{ task_id: string }>("/api/simulate/async", p),
  simulateStatus: (task_id: string) => j<TaskState>(`/api/simulate/status/${task_id}`),
  interventions: () => j<Intervention[]>("/api/interventions"),
  postIntervention: (p: Omit<Intervention, "id" | "ts">) => post<Intervention>("/api/interventions", p),
  efficiencyStatus: (c: string) => j<EfficiencyStatus>(`/api/efficiency/status?case=${c}`),
  efficiencyScan: (c: string) =>
    post<{ added: number; suggestions: Suggestion[] }>(`/api/efficiency/scan?case=${c}`, {}),
  efficiencySuggestions: (status?: string) =>
    j<Suggestion[]>(`/api/efficiency/suggestions${status ? `?status=${status}` : ""}`),
  efficiencyDecide: (id: number, p: DecidePayload) =>
    post<Suggestion>(`/api/efficiency/suggestions/${id}/decide`, p),
  autoState: () => j<AutoState>("/api/efficiency/auto"),
  autoUpdate: (patch: Partial<AutoConfig>) => post<AutoConfig>("/api/efficiency/auto", patch),
  autoTick: () => post<AutoTickResult>("/api/efficiency/auto/tick", {}),
  autoKill: () => post<AutoConfig>("/api/efficiency/auto/kill", {}),
};
