// 与 backend 的数据契约，见 docs/coursework/events-schema.md

export interface MachineNode {
  id: number;
  process_time: number;
  cluster: number;
  successors: number[];
  predecessors: number[];
  x: number;
  y: number;
  label: string;
}

export interface QueueNode {
  id: number;
  from_machines: number[];
  to_machine: number;
  capacity: number;
  transp_time: number;
  x: number;
  y: number;
}

// conveyor_id 可能对应多条物理边（M3→Q5 和 M4→Q5 都是 conv 5）
export interface ConveyorEdge {
  id: number;
  from_machine: number;
  to_queue_id: number;
  to_machine: number;
  transp_time: number;
}

export interface Topology {
  machines: MachineNode[];
  queues: QueueNode[];
  conveyors: ConveyorEdge[];
  branches: { machine_id: number; out_queues: number[] }[];
  initial_by_queue: Record<string, string[]>;
  machine_proc_time: Record<string, number>;
}

export type SimEvent =
  | { t: number; type: "part_create"; part_id: number; queue_id: number }
  | { t: number; type: "queue_enter"; queue_id: number; part_id: number; source?: string }
  | { t: number; type: "queue_exit"; queue_id: number; part_id: number }
  | { t: number; type: "conveyor_enter"; conveyor_id: number; part_id: number; to_queue_id: number; transp_time: number }
  | { t: number; type: "conveyor_exit"; conveyor_id: number; part_id: number; to_queue_id: number }
  | { t: number; type: "terminate"; part_id: number; creation_time: number; cycle_time: number }
  | { t: number; type: "decision_start"; part_id: number; branch_id: number; options: number[] }
  | { t: number; type: "decision_end"; part_id: number; branch_id: number; rcts: Record<string, number>; chosen_conveyor_id: number; gain_pct: number; applied: boolean };

export interface EventsPayload {
  meta: Record<string, unknown>;
  events: SimEvent[];
}

export interface KPI {
  count: number;
  avg_ct: number;
  min_ct: number;
  max_ct: number;
  throughput: number;
  last_t: number;
}
