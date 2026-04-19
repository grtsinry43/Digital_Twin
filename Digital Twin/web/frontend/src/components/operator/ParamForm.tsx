import { useEffect, useState } from "react";
import { Button, HTMLSelect, InputGroup, NumericInput, Tag, Tooltip } from "@blueprintjs/core";
import { api, type SimulateBounds, type SimulateParams } from "../../api";

const BASELINE: SimulateParams = {
  m3_time: 60,
  m4_time: 38,
  q3_capacity: 10,
  q4_capacity: 10,
  policy: "alternated",
  horizon: 2000,
};

interface Props {
  onSubmit: (params: SimulateParams, operator: string, note: string) => Promise<void>;
  running: boolean;
}

export function ParamForm({ onSubmit, running }: Props) {
  const [params, setParams] = useState<SimulateParams>(BASELINE);
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [bounds, setBounds] = useState<SimulateBounds | null>(null);

  useEffect(() => {
    api.simulateBounds().then(setBounds).catch(() => {});
  }, []);

  function set<K extends keyof SimulateParams>(k: K, v: SimulateParams[K]) {
    setParams((p) => ({ ...p, [k]: v }));
  }

  const violations: string[] = [];
  if (bounds) {
    for (const [k, v] of Object.entries(params)) {
      if (k === "policy") continue;
      const b = bounds.bounds[k];
      if (b && typeof v === "number" && (v < b[0] || v > b[1])) {
        violations.push(`${k} ∈ [${b[0]}, ${b[1]}]（当前 ${v}）`);
      }
    }
  }
  if (!operator.trim()) violations.push("需要填写操作员（审计日志必填）");

  const changed = Object.entries(params).filter(([k, v]) => (BASELINE as any)[k] !== v).map(([k]) => k);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "ui-monospace, 'SF Mono', monospace" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Field label="M3 处理时间 (s)" hint="瓶颈机。基线 60s" baseline={BASELINE.m3_time} bounds={bounds?.bounds.m3_time}>
          <NumericInput
            value={params.m3_time}
            onValueChange={(v) => !isNaN(v) && set("m3_time", v)}
            min={bounds?.bounds.m3_time[0]}
            max={bounds?.bounds.m3_time[1]}
            stepSize={1}
            fill
          />
        </Field>
        <Field label="M4 处理时间 (s)" hint="快路径机。基线 38s" baseline={BASELINE.m4_time} bounds={bounds?.bounds.m4_time}>
          <NumericInput
            value={params.m4_time}
            onValueChange={(v) => !isNaN(v) && set("m4_time", v)}
            min={bounds?.bounds.m4_time[0]}
            max={bounds?.bounds.m4_time[1]}
            stepSize={1}
            fill
          />
        </Field>
        <Field label="Horizon (仿真秒)" hint="短仿真窗。基线 2000" baseline={BASELINE.horizon} bounds={bounds?.bounds.horizon}>
          <NumericInput
            value={params.horizon}
            onValueChange={(v) => !isNaN(v) && set("horizon", v)}
            min={bounds?.bounds.horizon[0]}
            max={bounds?.bounds.horizon[1]}
            stepSize={100}
            fill
          />
        </Field>

        <Field label="Q3 容量 (M2→M3)" hint="慢路径队列。基线 10" baseline={BASELINE.q3_capacity} bounds={bounds?.bounds.q3_capacity}>
          <NumericInput
            value={params.q3_capacity}
            onValueChange={(v) => !isNaN(v) && set("q3_capacity", v)}
            min={bounds?.bounds.q3_capacity[0]}
            max={bounds?.bounds.q3_capacity[1]}
            stepSize={1}
            fill
          />
        </Field>
        <Field label="Q4 容量 (M2→M4)" hint="快路径队列。基线 10" baseline={BASELINE.q4_capacity} bounds={bounds?.bounds.q4_capacity}>
          <NumericInput
            value={params.q4_capacity}
            onValueChange={(v) => !isNaN(v) && set("q4_capacity", v)}
            min={bounds?.bounds.q4_capacity[0]}
            max={bounds?.bounds.q4_capacity[1]}
            stepSize={1}
            fill
          />
        </Field>
        <Field label="分支策略" hint="M2 的派发规则" baseline={BASELINE.policy} bounds={undefined}>
          <HTMLSelect
            value={params.policy}
            onChange={(e) => set("policy", e.currentTarget.value as SimulateParams["policy"])}
            fill
          >
            {(bounds?.policies ?? ["alternated", "first"]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </HTMLSelect>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
        <Field label="操作员" hint="写入干预日志" baseline="" bounds={undefined}>
          <InputGroup value={operator} onChange={(e) => setOperator(e.currentTarget.value)} placeholder="如 shift_A_zhang" />
        </Field>
        <Field label="备注" hint="为什么这样调？" baseline="" bounds={undefined}>
          <InputGroup value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="如 M3 维修后降速验证" />
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          intent="primary"
          icon="play"
          disabled={running || violations.length > 0}
          loading={running}
          onClick={() => onSubmit(params, operator.trim(), note.trim())}
        >
          运行 What-if + 记录
        </Button>
        <Button
          icon="reset"
          minimal
          disabled={running}
          onClick={() => setParams(BASELINE)}
        >
          还原基线
        </Button>
        <div style={{ flex: 1 }} />
        {changed.length > 0 && <Tag intent="warning" minimal>已改: {changed.join(", ")}</Tag>}
        {violations.map((v, i) => (
          <Tooltip key={i} content={v}>
            <Tag intent="danger" minimal>约束</Tag>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function Field({ label, hint, baseline, bounds, children }: { label: string; hint: string; baseline: string | number; bounds: [number, number] | undefined; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
        <span style={{ color: "#a6adb8", fontSize: 11, letterSpacing: 1 }}>{label}</span>
        {bounds && <span style={{ color: "#5c6370", fontSize: 9 }}>[{bounds[0]}, {bounds[1]}]</span>}
      </div>
      {children}
      <div style={{ color: "#5c6370", fontSize: 9, marginTop: 3 }}>
        {hint}
        {baseline !== "" && <span>  ·  基线 <span style={{ color: "#7d8694" }}>{String(baseline)}</span></span>}
      </div>
    </div>
  );
}
