// 把事件流回放成"世界状态"：零件在哪里、KPI 累积、最近一条决策
import type { SimEvent } from "../types";

export type PartLocation =
  | { kind: "queue"; queue_id: number; since_t: number }
  | { kind: "machine"; machine_id: number; since_t: number }
  | { kind: "conveyor"; conveyor_id: number; from_machine: number | null; to_queue_id: number; enter_t: number; transp_time: number }
  | { kind: "gone" };

export interface Decision {
  t: number;
  part_id: number;
  rcts: Record<string, number>;
  chosen: number;
  gain_pct: number;
  applied: boolean;
  options: number[];
  branch_id: number;
}

export interface WorldState {
  t_sim: number;
  parts: Map<number, PartLocation>;
  // 每条队列/机器当前有哪些零件 id（按进入顺序）
  queueContents: Map<number, number[]>;
  machineBusy: Map<number, { part_id: number; since_t: number } | null>;
  // KPI
  completedLaps: number; // 总的 terminate 次数
  cycleTimes: number[]; // 每圈 cycle_time
  // 决策
  decisionsApplied: number;
  recentDecisions: Decision[]; // 按 t 倒序，最多 20 条
  activeDecision: Decision | null; // 最近一次 decision_end
  thinking: { part_id: number; options: number[]; branch_id: number; start_t: number } | null;
  // 累计曲线
  cumulative: { t: number; count: number; avg_ct: number }[];
}

export function emptyWorld(): WorldState {
  return {
    t_sim: 0,
    parts: new Map(),
    queueContents: new Map(),
    machineBusy: new Map(),
    completedLaps: 0,
    cycleTimes: [],
    decisionsApplied: 0,
    recentDecisions: [],
    activeDecision: null,
    thinking: null,
    cumulative: [],
  };
}

// 队列到下游机器的映射（用于 queue_exit 推断哪台机器"抓到"了零件）
export type QueueToMachine = Map<number, number>;

export function applyEvent(w: WorldState, ev: SimEvent, qtm: QueueToMachine): WorldState {
  // 原地 mutate 比每次 structural clone 快很多；组件订阅时浅拷贝引用即可
  w.t_sim = Math.max(w.t_sim, ev.t);
  switch (ev.type) {
    case "part_create": {
      w.parts.set(ev.part_id, { kind: "queue", queue_id: ev.queue_id, since_t: ev.t });
      push(w.queueContents, ev.queue_id, ev.part_id);
      break;
    }
    case "queue_enter": {
      // part_create 已经 push 过，这里防重复
      const existing = w.parts.get(ev.part_id);
      if (!existing || existing.kind !== "queue" || (existing as any).queue_id !== ev.queue_id) {
        w.parts.set(ev.part_id, { kind: "queue", queue_id: ev.queue_id, since_t: ev.t });
      }
      if (!contains(w.queueContents, ev.queue_id, ev.part_id)) {
        push(w.queueContents, ev.queue_id, ev.part_id);
      }
      break;
    }
    case "queue_exit": {
      pull(w.queueContents, ev.queue_id, ev.part_id);
      const machineId = qtm.get(ev.queue_id);
      if (machineId != null) {
        w.parts.set(ev.part_id, { kind: "machine", machine_id: machineId, since_t: ev.t });
        w.machineBusy.set(machineId, { part_id: ev.part_id, since_t: ev.t });
      }
      break;
    }
    case "conveyor_enter": {
      // 从上游机器占用里释放，并记住来源机器以便可视化定位
      let fromMachine: number | null = null;
      for (const [mid, busy] of w.machineBusy) {
        if (busy && busy.part_id === ev.part_id) {
          fromMachine = mid;
          w.machineBusy.set(mid, null);
        }
      }
      w.parts.set(ev.part_id, {
        kind: "conveyor",
        conveyor_id: ev.conveyor_id,
        from_machine: fromMachine,
        to_queue_id: ev.to_queue_id,
        enter_t: ev.t,
        transp_time: ev.transp_time,
      });
      break;
    }
    case "conveyor_exit": {
      // queue_enter 会紧随其后，这里先标记为即将入队
      w.parts.set(ev.part_id, { kind: "queue", queue_id: ev.to_queue_id, since_t: ev.t });
      break;
    }
    case "terminate": {
      w.completedLaps += 1;
      w.cycleTimes.push(ev.cycle_time);
      const avg = w.cycleTimes.reduce((a, b) => a + b, 0) / w.cycleTimes.length;
      w.cumulative.push({ t: ev.t, count: w.completedLaps, avg_ct: avg });
      break;
    }
    case "decision_start": {
      w.thinking = { part_id: ev.part_id, options: ev.options, branch_id: ev.branch_id, start_t: ev.t };
      break;
    }
    case "decision_end": {
      w.thinking = null;
      const d: Decision = {
        t: ev.t,
        part_id: ev.part_id,
        rcts: ev.rcts,
        chosen: ev.chosen_conveyor_id,
        gain_pct: ev.gain_pct,
        applied: ev.applied,
        options: [],
        branch_id: ev.branch_id,
      };
      w.activeDecision = d;
      w.recentDecisions.unshift(d);
      if (w.recentDecisions.length > 30) w.recentDecisions.pop();
      if (ev.applied) w.decisionsApplied += 1;
      break;
    }
  }
  return w;
}

function push(m: Map<number, number[]>, k: number, v: number) {
  const a = m.get(k) ?? [];
  a.push(v);
  m.set(k, a);
}
function pull(m: Map<number, number[]>, k: number, v: number) {
  const a = m.get(k);
  if (!a) return;
  const i = a.indexOf(v);
  if (i >= 0) a.splice(i, 1);
}
function contains(m: Map<number, number[]>, k: number, v: number) {
  return (m.get(k) ?? []).includes(v);
}

export function cloneWorld(w: WorldState): WorldState {
  return {
    ...w,
    parts: new Map(w.parts),
    queueContents: new Map([...w.queueContents].map(([k, v]) => [k, [...v]])),
    machineBusy: new Map(w.machineBusy),
    cycleTimes: [...w.cycleTimes],
    recentDecisions: [...w.recentDecisions],
    cumulative: [...w.cumulative],
  };
}
