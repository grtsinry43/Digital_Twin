import { useMemo } from "react";
import type { ConveyorEdge, Topology } from "../types";
import type { WorldState } from "../playback/world";

interface Props {
  topology: Topology;
  world: WorldState;
  label: string;
  accent: string;
}

const MACHINE_W = 94;
const MACHINE_H = 60;

export function ShopCanvas({ topology, world, label, accent }: Props) {
  const { minX, maxX, minY, maxY } = useMemo(() => {
    const xs = topology.machines.map((m) => m.x);
    const ys = topology.machines.map((m) => m.y);
    return {
      minX: Math.min(...xs) - 100,
      maxX: Math.max(...xs) + 100,
      minY: Math.min(...ys) - 140,
      maxY: Math.max(...ys) + 100,
    };
  }, [topology]);
  const width = maxX - minX;
  const height = maxY - minY;

  const machineById = useMemo(() => new Map(topology.machines.map((m) => [m.id, m])), [topology]);
  const queueById = useMemo(() => new Map(topology.queues.map((q) => [q.id, q])), [topology]);

  // 对 conveyor 5（M3/M4 共享），按 from_machine 找到对应边
  function findEdge(cid: number, from: number | null): ConveyorEdge | undefined {
    const edges = topology.conveyors.filter((c) => c.id === cid);
    if (edges.length === 1) return edges[0];
    if (from != null) return edges.find((e) => e.from_machine === from) ?? edges[0];
    return edges[0];
  }

  // Part 圆点位置
  const dots: { id: number; x: number; y: number; moving: boolean }[] = [];
  for (const [pid, loc] of world.parts) {
    if (loc.kind === "gone") continue;
    if (loc.kind === "queue") {
      const q = queueById.get(loc.queue_id);
      if (!q) continue;
      const contents = world.queueContents.get(q.id) ?? [];
      const idx = Math.max(0, contents.indexOf(pid));
      dots.push({ id: pid, x: q.x + (idx - (contents.length - 1) / 2) * 12, y: q.y + 22, moving: false });
    } else if (loc.kind === "machine") {
      const m = machineById.get(loc.machine_id);
      if (!m) continue;
      dots.push({ id: pid, x: m.x, y: m.y, moving: false });
    } else if (loc.kind === "conveyor") {
      const edge = findEdge(loc.conveyor_id, loc.from_machine);
      if (!edge) continue;
      const from = machineById.get(edge.from_machine)!;
      const to = queueById.get(edge.to_queue_id)!;
      const p = Math.max(0, Math.min(1, (world.t_sim - loc.enter_t) / loc.transp_time));
      dots.push({
        id: pid,
        x: from.x + (to.x - from.x) * p,
        y: from.y + (to.y - from.y) * p,
        moving: true,
      });
    }
  }

  const branchMachines = new Set(topology.branches.map((b) => b.machine_id));

  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <marker id={`arrow-${label}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7380" />
        </marker>
        <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 传送带边 —— 每个 conveyor edge 画一条线 */}
      {topology.conveyors.map((c, i) => {
        const from = machineById.get(c.from_machine)!;
        const to = queueById.get(c.to_queue_id)!;
        const isBranch = branchMachines.has(c.from_machine);
        // 闭环边（conv 1: M5→M1）走顶部弧线
        const isLoop = c.id === 1;
        if (isLoop) {
          const ctrlX = (from.x + to.x) / 2;
          const ctrlY = minY + 60;
          const q = queueById.get(c.to_queue_id)!;
          return (
            <path
              key={i}
              d={`M ${from.x} ${from.y - 30} Q ${ctrlX} ${ctrlY} ${q.x} ${q.y}`}
              stroke="#3a4048"
              strokeWidth={2}
              fill="none"
              strokeDasharray="3 4"
              markerEnd={`url(#arrow-${label})`}
            />
          );
        }
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={isBranch ? "#5a616c" : "#3a4048"}
            strokeWidth={isBranch ? 2.5 : 2}
            strokeDasharray={isBranch ? "6 4" : undefined}
            markerEnd={`url(#arrow-${label})`}
          />
        );
      })}

      {/* 队列胶囊 */}
      {topology.queues.map((q) => {
        const len = world.queueContents.get(q.id)?.length ?? 0;
        const fill = len > 0 ? "#1a2634" : "#141820";
        return (
          <g key={q.id}>
            <rect x={q.x - 22} y={q.y - 10} width={44} height={20} rx={10} fill={fill} stroke="#4a5262" strokeWidth={1} />
            <text x={q.x} y={q.y + 4} textAnchor="middle" fontSize={10} fontFamily="ui-monospace, 'SF Mono', monospace" fill="#a6adb8">
              Q{q.id}·{len}
            </text>
          </g>
        );
      })}

      {/* 机器 */}
      {topology.machines.map((m) => (
        <g key={m.id}>
          <rect
            x={m.x - MACHINE_W / 2}
            y={m.y - MACHINE_H / 2}
            width={MACHINE_W}
            height={MACHINE_H}
            rx={4}
            fill="#141820"
            stroke={world.machineBusy.get(m.id) ? accent : "#3a4048"}
            strokeWidth={2}
            filter={world.machineBusy.get(m.id) ? `url(#glow-${label})` : undefined}
          />
          <text x={m.x} y={m.y - 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="#e6e8eb" fontFamily="ui-monospace, 'SF Mono', monospace">
            M{m.id}
          </text>
          <text x={m.x} y={m.y + 12} textAnchor="middle" fontSize={10} fill="#7d8694" fontFamily="ui-monospace, 'SF Mono', monospace">
            {m.process_time}s
          </text>
        </g>
      ))}

      {/* 零件小圆点 */}
      {dots.map((p) => (
        <g key={p.id}>
          <circle
            cx={p.x}
            cy={p.y}
            r={5}
            fill={p.moving ? accent : "#d7dbe0"}
            stroke={p.moving ? "transparent" : "#6b7380"}
            strokeWidth={p.moving ? 0 : 1}
            opacity={p.moving ? 0.95 : 1}
          />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={8} fill="#9ba4b0" fontFamily="ui-monospace, 'SF Mono', monospace">
            {p.id}
          </text>
        </g>
      ))}

      <text x={minX + 16} y={minY + 28} fontSize={14} fontWeight={600} fill="#e6e8eb" fontFamily="ui-monospace, 'SF Mono', monospace">
        {label}
      </text>
      <text x={minX + 16} y={minY + 46} fontSize={11} fill="#7d8694" fontFamily="ui-monospace, 'SF Mono', monospace">
        已完成 {world.completedLaps} · 决策 {world.decisionsApplied}
      </text>
    </svg>
  );
}
