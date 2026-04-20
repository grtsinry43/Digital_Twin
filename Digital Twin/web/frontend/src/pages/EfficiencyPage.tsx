import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  HTMLSelect,
  InputGroup,
  NumericInput,
  Tag,
} from "@blueprintjs/core";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type AutoConfig,
  type AutoState,
  type DecidePayload,
  type EfficiencyMachine,
  type EfficiencyStatus,
  type Suggestion,
} from "../api";

const AXIS = { stroke: "#5c6370", fontSize: 10, fontFamily: "ui-monospace, 'SF Mono', monospace" };

const STATE_COLOR: Record<string, string> = {
  ok: "#2ecc71",
  watch: "#f39c12",
  drift: "#e74c3c",
};

const DATA_SOURCES = [
  { value: "02s", label: "随机仿真（5s_stho · 正态扰动）" },
  { value: "02", label: "确定仿真（5s_determ · 无扰动）" },
  { value: "01", label: "Case01 理想基线" },
];

export function EfficiencyPage() {
  const [source, setSource] = useState<string>("02s");
  const [status, setStatus] = useState<EfficiencyStatus | null>(null);
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<Suggestion[]>([]);
  const [autoSt, setAutoSt] = useState<AutoState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [operator, setOperator] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [s, p, all, a] = await Promise.all([
        api.efficiencyStatus(source),
        api.efficiencySuggestions("pending"),
        api.efficiencySuggestions(),
        api.autoState(),
      ]);
      setStatus(s);
      setPending(p);
      setHistory(all.filter((x) => x.status !== "pending").slice(0, 50));
      setAutoSt(a);
    } catch (e: any) {
      setErr(String(e.message ?? e));
    }
  }, [source]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // auto 开启时后台定时刷新
    if (!autoSt?.cfg.enabled || autoSt.cfg.mode !== "auto") return;
    const id = window.setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [autoSt?.cfg.enabled, autoSt?.cfg.mode, refresh]);

  const onScan = async () => {
    setLoading(true);
    setErr(null);
    try {
      await api.efficiencyScan(source);
      await refresh();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const onAutoUpdate = async (patch: Partial<AutoConfig>) => {
    try {
      await api.autoUpdate(patch);
      await refresh();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    }
  };
  const onAutoTick = async () => {
    setLoading(true);
    try {
      await api.autoTick();
      await refresh();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  };
  const onAutoKill = async () => {
    try {
      await api.autoKill();
      await refresh();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    }
  };

  const onDecide = async (id: number, p: DecidePayload) => {
    if (!p.operator) {
      setErr("请先填审批人");
      return;
    }
    try {
      await api.efficiencyDecide(id, p);
      await refresh();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    }
  };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <Banner />

      {autoSt && (
        <AutoPanel
          state={autoSt}
          onUpdate={onAutoUpdate}
          onTick={onAutoTick}
          onKill={onAutoKill}
          loading={loading}
        />
      )}

      <Section title="数据源与审批人">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Label>数据源</Label>
          <HTMLSelect
            value={source}
            onChange={(e) => setSource(e.currentTarget.value)}
            options={DATA_SOURCES}
          />
          <Label>审批人</Label>
          <InputGroup
            value={operator}
            onChange={(e) => setOperator(e.currentTarget.value)}
            placeholder="必填（approve/modify 会写入审计）"
            style={{ width: 220 }}
            small
          />
          <Button icon="refresh" small onClick={refresh}>
            刷新
          </Button>
          <Button icon="search-template" small intent="primary" loading={loading} onClick={onScan}>
            扫描并入队
          </Button>
          <div style={{ flex: 1 }} />
          {status && (
            <span style={{ color: "#7d8694", fontSize: 11 }}>
              阈值: Δ≥{status.thresholds.sig_pct}% · n≥{status.thresholds.min_samples} · 窗口 n={status.thresholds.window_last}
            </span>
          )}
        </div>
        {err && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "#2a1618",
              border: "1px solid #5a1e22",
              color: "#ff8a8a",
              fontSize: 11,
            }}
          >
            {err}
          </div>
        )}
      </Section>

      <Section title="机器效率实时监控">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 8,
          }}
        >
          {status?.machines.map((m) => (
            <MachineCard key={m.machine_id} m={m} />
          ))}
          {!status?.machines.length && <Empty>无数据</Empty>}
        </div>
      </Section>

      <Section title={`待审批建议 (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>暂无待审批</Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                operator={operator}
                onDecide={onDecide}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="审批历史">
        <HistoryTable rows={history} />
      </Section>
    </div>
  );
}

function AutoPanel({
  state,
  onUpdate,
  onTick,
  onKill,
  loading,
}: {
  state: AutoState;
  onUpdate: (p: Partial<AutoConfig>) => void;
  onTick: () => void;
  onKill: () => void;
  loading: boolean;
}) {
  const { cfg } = state;
  const active = cfg.enabled && cfg.mode === "auto";
  const bg = active ? "rgba(46,204,113,0.06)" : "rgba(243,156,18,0.04)";
  const border = active ? "#2ecc71" : "#262c38";
  const lastTick = state.last_tick_ts ? new Date(state.last_tick_ts).toLocaleTimeString() : "—";
  return (
    <Card
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `3px solid ${active ? "#2ecc71" : "#f39c12"}`,
        padding: "10px 14px",
        boxShadow: "none",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            padding: "2px 8px",
            border: `1px solid ${active ? "#2ecc71" : "#f39c12"}`,
            color: active ? "#2ecc71" : "#f39c12",
            fontSize: 10,
            letterSpacing: 2,
            fontWeight: 600,
          }}
        >
          {active ? "AUTO · 自动调节已启用" : "MANUAL · 人工监管"}
        </span>
        <Label>模式</Label>
        <HTMLSelect
          value={cfg.mode}
          onChange={(e) => onUpdate({ mode: e.currentTarget.value as AutoConfig["mode"] })}
          options={[
            { value: "manual", label: "manual" },
            { value: "auto", label: "auto" },
          ]}
        />
        <Label>总开关</Label>
        <Button
          small
          intent={cfg.enabled ? "success" : "none"}
          onClick={() => onUpdate({ enabled: !cfg.enabled })}
        >
          {cfg.enabled ? "ENABLED" : "DISABLED"}
        </Button>
        <Button small icon="play" onClick={onTick} loading={loading}>
          立即扫描
        </Button>
        <Button small intent="danger" icon="stop" onClick={onKill}>
          KILL-SWITCH
        </Button>
        <div style={{ flex: 1 }} />
        <span style={{ color: "#7d8694", fontSize: 11 }}>
          上次 tick {lastTick} · 累计自动应用 {state.applied_count}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <Label>幅度上限 %</Label>
        <NumericInput
          value={cfg.max_auto_pct}
          min={1}
          max={100}
          stepSize={1}
          onValueChange={(v) => onUpdate({ max_auto_pct: v })}
          buttonPosition="none"
          style={{ width: 56 }}
          small
        />
        <Label>冷却 s</Label>
        <NumericInput
          value={cfg.cooldown_s}
          min={30}
          max={86400}
          stepSize={30}
          onValueChange={(v) => onUpdate({ cooldown_s: v })}
          buttonPosition="none"
          style={{ width: 72 }}
          small
        />
        <Label>扫描间隔 s</Label>
        <NumericInput
          value={cfg.interval_s}
          min={5}
          max={3600}
          stepSize={5}
          onValueChange={(v) => onUpdate({ interval_s: v })}
          buttonPosition="none"
          style={{ width: 64 }}
          small
        />
        <Label>去重窗 s</Label>
        <NumericInput
          value={cfg.dedup_window_s}
          min={60}
          max={86400}
          stepSize={60}
          onValueChange={(v) => onUpdate({ dedup_window_s: v })}
          buttonPosition="none"
          style={{ width: 72 }}
          small
        />
        {cfg.kill_ts && (
          <span style={{ color: "#e74c3c", fontSize: 10 }}>
            kill@{new Date(cfg.kill_ts).toLocaleTimeString()}
          </span>
        )}
      </div>
      {state.last_result && (
        <LastTickSummary r={state.last_result} />
      )}
    </Card>
  );
}

function LastTickSummary({ r }: { r: NonNullable<AutoState["last_result"]> }) {
  return (
    <div style={{ marginTop: 8, padding: 8, background: "#0c0e13", border: "1px solid #1c2128", fontSize: 11 }}>
      <div style={{ color: "#a6adb8", marginBottom: 4 }}>
        最近一次 tick: 新增 {r.added} · 应用 {r.applied.length} · 跳过 {r.skipped.length}
        {r.note && <span style={{ color: "#f39c12" }}>（{r.note}）</span>}
      </div>
      {r.applied.map((a) => (
        <div key={a.id} style={{ color: "#2ecc71" }}>
          ✓ #{a.id} {a.label} {a.param} {a.from} → {a.applied_to}
        </div>
      ))}
      {r.skipped.map((s) => (
        <div key={s.id} style={{ color: "#f39c12" }}>
          ⏸ #{s.id} {s.reason}
        </div>
      ))}
    </div>
  );
}

function MachineCard({ m }: { m: EfficiencyMachine }) {
  const color = STATE_COLOR[m.state] ?? "#7d8694";
  const sign = m.delta_pct > 0 ? "+" : "";
  const dirLabel = m.direction === "slower" ? "变慢 ↑" : m.direction === "faster" ? "变快 ↓" : "平稳";
  return (
    <Card
      style={{
        background: "#0c0e13",
        border: "1px solid #1c2128",
        borderLeft: `3px solid ${color}`,
        padding: "10px 14px",
        boxShadow: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{m.label}</span>
        <span style={{ flex: 1 }} />
        <Tag minimal style={{ color, borderColor: color }}>
          {m.state.toUpperCase()}
        </Tag>
        {!m.tunable && <Tag minimal>只读</Tag>}
      </div>
      <Row label="标称" v={`${m.nominal}s`} />
      <Row label="实测" v={`${m.measured_mean}s  (n=${m.n})`} color={color} />
      <Row label="Δ" v={`${sign}${m.delta_pct.toFixed(1)}%  · ${dirLabel}`} color={color} />
      <Row label="CI" v={`${m.ci_low}–${m.ci_high}s`} muted />
      {m.changepoint_t != null && <Row label="变点" v={`t≈${m.changepoint_t}s`} muted />}
      <div style={{ height: 60, marginTop: 6 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={m.rolling} margin={{ top: 2, right: 4, left: -32, bottom: -10 }}>
            <CartesianGrid stroke="#1c2128" strokeDasharray="2 3" />
            <XAxis dataKey="t" {...AXIS} tick={false} />
            <YAxis {...AXIS} width={28} domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip contentStyle={{ background: "#0f1218", border: "1px solid #262c38", fontSize: 11 }} />
            <ReferenceLine y={m.nominal} stroke="#5ba8ff" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="mean"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SuggestionCard({
  s,
  operator,
  onDecide,
}: {
  s: Suggestion;
  operator: string;
  onDecide: (id: number, p: DecidePayload) => void;
}) {
  const [note, setNote] = useState("");
  const [newTo, setNewTo] = useState<number>(s.to);
  return (
    <div
      style={{
        background: "#0c0e13",
        border: "1px solid #1c2128",
        borderLeft: "3px solid #f39c12",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          #{s.id} · {s.label}
        </span>
        <Tag minimal intent={s.direction === "slower" ? "danger" : "success"}>
          {s.direction === "slower" ? "变慢" : "变快"} {s.delta_pct > 0 ? "+" : ""}
          {s.delta_pct.toFixed(1)}%
        </Tag>
        <span style={{ flex: 1 }} />
        <Tag minimal>
          {s.param}: {s.from} → {s.to}
        </Tag>
      </div>
      <div style={{ color: "#a6adb8", fontSize: 11 }}>{s.reason}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
        <InputGroup
          small
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="决策备注（可选）"
          style={{ flex: 1, minWidth: 160 }}
        />
        <span style={{ color: "#5c6370", fontSize: 10 }}>修改为</span>
        <NumericInput
          value={newTo}
          min={1}
          max={500}
          onValueChange={(v) => setNewTo(v)}
          buttonPosition="none"
          style={{ width: 60 }}
          small
        />
        <Button
          small
          intent="success"
          onClick={() => onDecide(s.id, { action: "approve", operator, note })}
        >
          批准
        </Button>
        <Button
          small
          intent="warning"
          onClick={() =>
            onDecide(s.id, { action: "modify", operator, note, new_to: newTo })
          }
        >
          修改后批准
        </Button>
        <Button
          small
          intent="danger"
          onClick={() => onDecide(s.id, { action: "reject", operator, note })}
        >
          拒绝
        </Button>
        <Button small onClick={() => onDecide(s.id, { action: "ignore", operator, note })}>
          忽略
        </Button>
      </div>
    </div>
  );
}

function HistoryTable({ rows }: { rows: Suggestion[] }) {
  if (!rows.length) return <Empty>暂无历史</Empty>;
  return (
    <div style={{ overflow: "auto", maxHeight: 300, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#a6adb8", textAlign: "left", borderBottom: "1px solid #1c2128" }}>
            <th style={TH}>#</th>
            <th style={TH}>时间</th>
            <th style={TH}>机器</th>
            <th style={TH}>参数</th>
            <th style={TH}>Δ</th>
            <th style={TH}>状态</th>
            <th style={TH}>审批人</th>
            <th style={TH}>应用值</th>
            <th style={TH}>备注</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #15181f" }}>
              <td style={TD}>{r.id}</td>
              <td style={TD}>{r.decided_ts ? new Date(r.decided_ts).toLocaleString() : "—"}</td>
              <td style={TD}>{r.label}</td>
              <td style={TD}>
                {r.param}: {r.from} → {r.to}
              </td>
              <td style={TD}>
                {r.delta_pct > 0 ? "+" : ""}
                {r.delta_pct.toFixed(1)}%
              </td>
              <td style={TD}>
                <StatusTag status={r.status} />
              </td>
              <td style={TD}>
                {r.decided_by?.startsWith("system:auto") ? (
                  <Tag minimal intent="primary">AUTO</Tag>
                ) : (
                  r.decided_by ?? "—"
                )}
              </td>
              <td style={TD}>{r.applied_to ?? "—"}</td>
              <td style={{ ...TD, color: "#a6adb8", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.decide_note || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusTag({ status }: { status: Suggestion["status"] }) {
  const map: Record<Suggestion["status"], "success" | "danger" | "warning" | "none"> = {
    approved: "success",
    modified: "warning",
    rejected: "danger",
    ignored: "none",
    pending: "warning",
  };
  return (
    <Tag minimal intent={map[status]}>
      {status}
    </Tag>
  );
}

const TH: React.CSSProperties = { padding: "6px 8px", fontWeight: 500 };
const TD: React.CSSProperties = { padding: "6px 8px", fontVariantNumeric: "tabular-nums" };

function Row({
  label,
  v,
  color = "#e6e8eb",
  muted,
}: {
  label: string;
  v: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "1px 0", fontSize: 11 }}>
      <span style={{ color: "#5c6370", width: 42 }}>{label}</span>
      <span style={{ color: muted ? "#7d8694" : color, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#7d8694", fontSize: 11, letterSpacing: 1 }}>{children}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, color: "#5c6370", fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: 11 }}>
      {children}
    </div>
  );
}

function Banner() {
  return (
    <div
      style={{
        padding: "6px 12px",
        background: "rgba(231,76,60,0.08)",
        border: "1px solid rgba(231,76,60,0.3)",
        color: "#ff8a8a",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        fontSize: 11,
        letterSpacing: 1,
      }}
    >
      机器效率感知 · 基于事件流 service time 对比 topology 标称值（滚动窗口 + 95% CI），对显著偏离发起审批建议；approve/modify 会写入干预审计日志
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
