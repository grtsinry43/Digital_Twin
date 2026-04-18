# 阶段 2 路线图 · Web 可视化

把 `run_case02_sync.py` 的内部流程做成 Web 演示。答辩时现场跑 Case01/Case02 对比。

## 目标

| # | 模块 | 展示内容 |
|---|---|---|
| 1 | 车间拓扑图 | 5 台机器 + 5 条队列 + 6 条传送带 + M2 分岔点；机器按状态上色 |
| 2 | 零件动画 | 零件作为小圆点沿队列→机器→传送带移动，标注 ID |
| 3 | 孪生决策侧栏 | 到达决策时刻时"孪生思考中"动画，显示两条路径的预测 RCT 对比柱 |
| 4 | KPI 实时曲线 | Avg CT / Throughput 随时间，Case01 vs Case02 两条线同屏 |
| 5 | 伪 MQTT 消息流 | "Twin → Physical: chosen path = Q4 for Part 6 (gain 56%)" 流式日志 |

## 技术栈

**后端**（`web/backend/`）
- FastAPI + uvicorn
- 复用 `experiments/twin_sync.py` 的快照 / 重建 / 预测函数
- WebSocket `/ws` 推送实时事件

**前端**（`web/frontend/`）
- Vite + React 18 + TypeScript
- D3.js（车间拓扑图 + 零件动画）
- Recharts（KPI 曲线）
- Tailwind CSS（快速布局）

## 任务拆解

### Task 8 · 给 components 加事件 hook

在 `dtwinpylib/dtwinpy/digital_model.py` 上加一个可选的 `event_callback` 参数。`Machine` 的状态转换、`Conveyor` 的 start/put、`Terminator` 的 terminate 都 emit 结构化事件：

```python
{"type": "machine_start", "t": 120, "machine_id": 2, "part_id": 6}
{"type": "conveyor_start", "t": 123, "conveyor_id": 4, "part_id": 6}
{"type": "terminate", "t": 200, "part_id": 6, "cycle_time": 200}
{"type": "decision_start", "t": 90, "part_id": 6, "branch": "M2"}
{"type": "decision_result", "t": 90, "part_id": 6, "rcts": {"3": 262, "4": 115}, "chosen": 4, "gain": 0.561}
```

事件通过 `asyncio.Queue` 传给 FastAPI 端。

### Task 9 · FastAPI 后端

```
GET  /api/model                 → 返回车间拓扑 JSON（nodes/arcs + 坐标）
POST /api/run?case=01|02        → 启动仿真，通过 WS 推送事件
WS   /ws                        → 服务端推送事件流（JSON lines）
GET  /api/results               → 返回已完成两案例的 KPI 汇总
```

为避免 SimPy 阻塞事件循环：在后台线程跑仿真，用 `asyncio.run_coroutine_threadsafe` 把事件打回 WS。

### Task 10 · React 前端

页面结构（单页）：

```
┌─────────────────────────────────────────────────────────┐
│  Header: Case 切换 [01 | 02 | Side-by-side] + Run 按钮  │
├──────────────────────────────┬──────────────────────────┤
│                              │  孪生决策侧栏             │
│                              │  ┌────────────────────┐  │
│    车间拓扑图（D3 SVG）        │  │ Thinking Part 6...  │  │
│    零件动画                   │  │ Q3: RCT=262        │  │
│                              │  │ Q4: RCT=115 ✓ (56%)│  │
│                              │  └────────────────────┘  │
├──────────────────────────────┴──────────────────────────┤
│  KPI 曲线（Recharts）                                    │
├──────────────────────────────────────────────────────────┤
│  伪 MQTT 消息流日志                                      │
└──────────────────────────────────────────────────────────┘
```

## 里程碑

| 里程碑 | 交付 |
|---|---|
| M1 | 事件 hook 接入，命令行脚本能打印 JSON 事件流 |
| M2 | FastAPI WS 能把仿真事件推到前端，前端用文本显示 |
| M3 | D3 车间图 + 零件动画能跑起来 |
| M4 | 孪生决策侧栏 + KPI 曲线上线 |
| M5 | 双 Case 同屏对跑 + 伪 MQTT 日志 |

## 待用户拍板的开放问题

1. **UI 语言**：中文 / 英文 / 双语？
2. **布局方式**：单 Case 切换 vs 双 Case 左右对屏？
3. **配色风格**：工业深色（类似 SCADA 大屏）vs 学术浅色？
4. **是否要播放控制**：倍速条、暂停、跳到某个决策点？
5. **是否要"离线回放"模式**：直接读 results/*.json 播放，不用跑实时仿真？（更适合答辩）
