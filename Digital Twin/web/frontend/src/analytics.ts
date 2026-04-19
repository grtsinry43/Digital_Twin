// 从事件流派生各种分析数据（纯函数，和回放时钟无关）
import type { SimEvent, Topology } from "./types";

export interface Analytics {
  horizon: number;
  utilization: { machineId: number; busyTime: number; pct: number; opCount: number }[];
  queueLen: Map<number, { t: number; len: number }[]>;
  pathTimes: { partId: number; viaConvId: number; startT: number; endT: number; duration: number }[];
  predictionVsActual: { t: number; partId: number; chosenCid: number; otherCid: number; predictedChosen: number; predictedOther: number; actual: number }[];
  perConveyorCount: Map<number, number>;
}

export function derive(events: SimEvent[], topology: Topology): Analytics {
  const horizon = events.length ? events[events.length - 1].t : 0;

  // —— 机器繁忙区间（queue_exit → 同零件下一次 conveyor_enter）
  const qToMachine = new Map<number, number>();
  topology.queues.forEach((q) => qToMachine.set(q.id, q.to_machine));

  const busyTotal = new Map<number, number>();
  const opCount = new Map<number, number>();
  topology.machines.forEach((m) => {
    busyTotal.set(m.id, 0);
    opCount.set(m.id, 0);
  });
  const pendingBusy = new Map<number, { partId: number; start: number }>(); // machineId → busy record

  // —— 队列长度序列
  const qLen = new Map<number, number>();
  const qSeries = new Map<number, { t: number; len: number }[]>();
  topology.queues.forEach((q) => {
    qLen.set(q.id, 0);
    qSeries.set(q.id, [{ t: 0, len: 0 }]);
  });

  // —— 分支路径记录
  const branchCids = new Set<number>();
  topology.branches.forEach((b) => b.out_queues.forEach((q) => branchCids.add(q)));
  const pendingPath = new Map<number, { viaConvId: number; startT: number }>(); // partId → latest branch conveyor entry
  const pathTimes: Analytics["pathTimes"] = [];

  // —— 预测 vs 实际
  const pendingDecisions: { t: number; partId: number; chosenCid: number; otherCid: number; predictedChosen: number; predictedOther: number }[] = [];
  const predictionVsActual: Analytics["predictionVsActual"] = [];

  // —— 各条传送带累计进入次数
  const convCount = new Map<number, number>();

  function pushQ(qid: number, t: number, delta: number) {
    const s = qSeries.get(qid);
    if (!s) return;
    const curr = (qLen.get(qid) ?? 0) + delta;
    qLen.set(qid, curr);
    const last = s[s.length - 1];
    if (last && last.t === t) {
      last.len = curr;
    } else {
      s.push({ t, len: curr });
    }
  }

  for (const ev of events) {
    switch (ev.type) {
      case "queue_enter":
        pushQ(ev.queue_id, ev.t, +1);
        break;
      case "queue_exit": {
        pushQ(ev.queue_id, ev.t, -1);
        const mid = qToMachine.get(ev.queue_id);
        if (mid != null) {
          pendingBusy.set(mid, { partId: ev.part_id, start: ev.t });
        }
        break;
      }
      case "conveyor_enter": {
        convCount.set(ev.conveyor_id, (convCount.get(ev.conveyor_id) ?? 0) + 1);
        // 哪台机器释放了这个 part？
        for (const [mid, b] of pendingBusy) {
          if (b.partId === ev.part_id) {
            busyTotal.set(mid, (busyTotal.get(mid) ?? 0) + (ev.t - b.start));
            opCount.set(mid, (opCount.get(mid) ?? 0) + 1);
            pendingBusy.delete(mid);
            break;
          }
        }
        if (branchCids.has(ev.conveyor_id)) {
          pendingPath.set(ev.part_id, { viaConvId: ev.conveyor_id, startT: ev.t });
        }
        break;
      }
      case "terminate": {
        // 收一个分支耗时
        const rec = pendingPath.get(ev.part_id);
        if (rec) {
          pathTimes.push({
            partId: ev.part_id,
            viaConvId: rec.viaConvId,
            startT: rec.startT,
            endT: ev.t,
            duration: ev.t - rec.startT,
          });
          pendingPath.delete(ev.part_id);
        }
        // 消耗一个 pending decision
        const idx = pendingDecisions.findIndex((d) => d.partId === ev.part_id);
        if (idx >= 0) {
          const d = pendingDecisions[idx];
          predictionVsActual.push({
            t: d.t,
            partId: d.partId,
            chosenCid: d.chosenCid,
            otherCid: d.otherCid,
            predictedChosen: d.predictedChosen,
            predictedOther: d.predictedOther,
            actual: ev.t - d.t,
          });
          pendingDecisions.splice(idx, 1);
        }
        break;
      }
      case "decision_end": {
        if (!ev.applied) break;
        const other =
          Object.keys(ev.rcts).map((k) => Number(k)).find((k) => k !== ev.chosen_conveyor_id) ?? 0;
        pendingDecisions.push({
          t: ev.t,
          partId: ev.part_id,
          chosenCid: ev.chosen_conveyor_id,
          otherCid: other,
          predictedChosen: ev.rcts[String(ev.chosen_conveyor_id)],
          predictedOther: ev.rcts[String(other)] ?? 0,
        });
        break;
      }
    }
  }

  // 机器利用率 —— 加上仍未结束的 busy（part 还在机器里）
  for (const [mid, b] of pendingBusy) {
    busyTotal.set(mid, (busyTotal.get(mid) ?? 0) + (horizon - b.start));
  }

  const utilization = topology.machines.map((m) => ({
    machineId: m.id,
    busyTime: busyTotal.get(m.id) ?? 0,
    pct: horizon > 0 ? ((busyTotal.get(m.id) ?? 0) / horizon) * 100 : 0,
    opCount: opCount.get(m.id) ?? 0,
  }));

  return {
    horizon,
    utilization,
    queueLen: qSeries,
    pathTimes,
    predictionVsActual,
    perConveyorCount: convCount,
  };
}

