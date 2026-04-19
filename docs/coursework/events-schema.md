# 事件与拓扑数据字典

本文档解释 `experiments/results/` 下三份 JSON 每个字段的含义，作为前端可视化的"契约"。

---

## 1. `topology.json` · 车间拓扑（一次性）

```jsonc
{
  "machines":  [...],   // 5 台机器
  "queues":    [...],   // 6 条队列（缓冲区）
  "conveyors": [...],   // 6 条传送带（一条队列对应一条传送带）
  "branches":  [...],   // 分叉机器列表
  "initial_wip": [...]  // 各队列初始零件
}
```

### 1.1 `machines[]`

| 字段 | 类型 | 含义 | 前端用途 |
|---|---|---|---|
| `id` | int | 机器编号 1–5 | 节点主键 |
| `process_time` | int | 加工时间（时间单位，可理解为秒） | tooltip / 标签 |
| `cluster` | int | 机器所在工艺层 (1–4) | 同层机器用同色 |
| `successors` | int[] | 下游机器 id 列表 | 判断是否为分叉点（长度>1） |
| `predecessors` | int[] | 上游机器 id 列表 | 画反向回流弧 |
| `x`, `y` | float | 画布像素坐标 | `<rect>` 位置 |
| `label` | string | 显示名 `"M2 (branch)"` | 渲染标签 |

### 1.2 `queues[]`

| 字段 | 含义 |
|---|---|
| `id` | 队列编号，与传送带 id 一致 |
| `from_machine` / `to_machine` | 这条队列承接的上下游机器 |
| `capacity` | 最大容量（零件数） |
| `transp_time` | 对应传送带的运输时间 |
| `x`, `y` | 队列胶囊的中心坐标 |

**注意**：在本模型里，**队列和传送带是一一配对**的——每条 arc 既是一段 queue（缓冲）也是一段 conveyor（运输）。零件的流转是：上游机器 → 放入 conveyor → 运输 → 放入 queue → 下游机器取。

### 1.3 `conveyors[]`

| 字段 | 含义 |
|---|---|
| `id` | 传送带编号 = 其目标 queue 的 id |
| `from_machine` | 起点机器 id |
| `to_queue_id` / `to_machine` | 终点队列 / 机器 id |
| `transp_time` | 运输耗时 |

### 1.4 `branches[]`

```json
[{"machine_id": 2, "out_queues": [3, 4]}]
```

M2 是唯一的分叉点；零件从 M2 出来可以走 Q3（→M3，60s）或 Q4（→M4，38s）。这是 RCT 决策发生的地方。

### 1.5 `initial_wip`

一个数组，`initial_wip[i]` 是 queue id `i+1` 的初始零件名列表。本实验中 12 个零件全部初始位于 Q1。

---

## 2. `events.json` · 仿真事件流

结构：

```jsonc
{
  "meta": {"case": "case01", "until": 2000, ...},
  "events": [ ... ]   // 按时间 t 排序（时间戳相同可能乱序）
}
```

所有事件都带 `t`（仿真时间，float）和 `type`（事件种类）。下面按种类说明。

### 2.1 `part_create` · 零件诞生

```json
{"t": 0.0, "type": "part_create", "part_id": 1, "queue_id": 1}
```

| 字段 | 含义 |
|---|---|
| `part_id` | 零件编号 |
| `queue_id` | 诞生时所在队列 |

本实验中 12 个零件都在 t=0 一次性诞生于 Q1。前端可据此生成零件对象 + 初始位置。后续产生的新零件是通过闭环系统流转，不会再发 `part_create`——这模型是**闭环的**，零件总数守恒。

### 2.2 `queue_enter` · 零件进入队列

```json
{"t": 0.0, "type": "queue_enter", "queue_id": 1, "part_id": 1, "source": "init"}
```

| 字段 | 含义 |
|---|---|
| `queue_id` | 目标队列 |
| `part_id` | 零件 |
| `source` | 仅在 `"init"` 时出现，表示初始生成 |

**触发时机**：
- `source=init`：初始分配
- 无 source：由上游 **conveyor_exit** 或某台机器直接 put 进来

前端动作：把零件小圆点滑入队列胶囊；队列长度 +1。

### 2.3 `queue_exit` · 零件离开队列

```json
{"t": 21.0, "type": "queue_exit", "queue_id": 1, "part_id": 1}
```

被下游机器取走。从 `topology.queues[i].to_machine` 可查到是哪台机器取走的。

前端动作：零件从队列滑入机器；同时机器进入 "Processing" 状态。

### 2.4 `conveyor_enter` · 零件登上传送带

```json
{"t": 11.0, "type": "conveyor_enter", "conveyor_id": 1, "part_id": 1, "to_queue_id": 1, "transp_time": 11}
```

| 字段 | 含义 |
|---|---|
| `conveyor_id` | 传送带 id |
| `part_id` | 零件 |
| `to_queue_id` | 终点队列 id |
| `transp_time` | 运输将持续多少单位时间 |

前端动作：机器完成加工 → 零件在传送带上以 `transp_time` 秒为期开始位移动画。

### 2.5 `conveyor_exit` · 零件下传送带

```json
{"t": 22.0, "type": "conveyor_exit", "conveyor_id": 1, "part_id": 1, "to_queue_id": 1}
```

紧接着会有一条同 `t` 的 `queue_enter`（目标 queue）。前端可以把这俩合并成一个"传送带→队列"动画结束帧。

### 2.6 `terminate` · 零件在 M5 完成一个循环

```json
{"t": 131.0, "type": "terminate", "part_id": 1, "creation_time": 0.0, "cycle_time": 131.0}
```

注意：Case01/Case02 是**闭环循环制**，零件在 M5 被 terminate 后会被"再生"成同编号的新一轮零件（见 Terminator 逻辑）。所以一个 `part_id` 会多次出现 terminate。Cycle Time = 这一圈的总用时。

前端用途：KPI 曲线 `Avg CT`、`Throughput`。累加到完成件数计数。

### 2.7 `decision_start` · 孪生开始思考（仅 Case02）

```json
{"t": 60.0, "type": "decision_start", "part_id": 4, "branch_id": 1, "options": [3, 4]}
```

| 字段 | 含义 |
|---|---|
| `part_id` | 正在被决策的零件 |
| `branch_id` | 哪个分叉（本模型唯一 branch_id=1，即 M2） |
| `options` | 可选的下游传送带 id 列表 |

前端动作：决策侧栏弹出 "🧠 Thinking for Part 4..."；短暂 loading 动画。

### 2.8 `decision_end` · 孪生给出结论（仅 Case02）

```json
{
  "t": 60.0, "type": "decision_end",
  "part_id": 4, "branch_id": 1,
  "rcts": {"3": 142, "4": 98},
  "chosen_conveyor_id": 4,
  "gain_pct": 30.98,
  "applied": true
}
```

| 字段 | 含义 |
|---|---|
| `rcts` | **关键数据**：每条路径的预测剩余完成时间 `{conveyor_id: predicted_finish_time}` |
| `chosen_conveyor_id` | 最小 RCT 对应的传送带 |
| `gain_pct` | `(max_rct - min_rct) / max_rct * 100`，即"不走最差路径能省多少" |
| `applied` | gain 是否超过阈值并真的写回主仿真（本实验 28 次决策全部 applied=true） |

前端动作：决策侧栏显示两条路径 RCT 对比柱；被选中的那条高亮 + `gain%` 徽章；记一条"伪 MQTT"消息 `Twin → Physical: part 4 → Q4 (gain 31%)`。

注意：`decision_start` 和 `decision_end` **时间戳相同**（同步贪心在主仿真暂停瞬间完成所有预测并写回）。前端可人为插入一小段 "thinking" 动画。

---

## 3. `parts.json` · 已完成零件记录

```json
[
  {"part_id": 1, "creation": 0, "termination": 131, "cycle_time": 131},
  ...
]
```

与 `terminate` 事件内容等价，但按 `part_id` 排序，便于算 KPI。前端可不使用（所有信息都在 events 里），但命令行脚本需要。

---

## 4. `decisions.json` · 决策历史（Case02 专属）

```json
[{"t": 60.0, "part_id": 4, "rcts": {"3": 142, "4": 98}, "chosen_conveyor_id": 4, "gain_pct": 30.98}]
```

是 `events.json` 里 `decision_end` 子集的摘录，保留原来的 plot_compare 脚本继续可用。

---

## 5. 常用派生量（给前端算的便笺）

1. **机器处理时长** = 该机器下一个 `conveyor_enter`/`queue_enter` 事件的 `t` − 对应 `queue_exit`（机器 queue_in）的 `t`
2. **队列当前长度**（t 时刻）= 在 [0, t] 内所有该 queue 的 `queue_enter` 数 − `queue_exit` 数
3. **传送带在运零件**（t 时刻）= 所有 `conveyor_enter` − `conveyor_exit`，差集即为"正在路上"的零件
4. **累计完成件数曲线**（KPI）= `terminate` 事件随 `t` 的累计计数
5. **Avg CT 滑动**（KPI）= 最近 N 条 `terminate.cycle_time` 的均值
6. **决策 gain 柱状**（Case02）= 所有 `decision_end.gain_pct` 的直方图

---

## 6. 数据量级参考

| Case | events 数 | 大小 | 典型决策数 |
|---|---|---|---|
| Case01 | ~1,300 | ~130 KB | 0 |
| Case02 | ~1,500 | ~180 KB | 28 |

两个 case 的 events.json 都足够小，可以直接打包进前端静态资源或走 HTTP GET，无需 WebSocket 流式推（除非你想做"实时模式"）。
