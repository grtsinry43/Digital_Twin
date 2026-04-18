# 工业互联网导论课设 — 数字孪生路径控制复现

复现论文 *A Digital Twin for Production Control Based on Remaining Cycle Time Prediction*（根目录 PDF），并在其基础上搭建可视化演示。

## 核心选择：A+ 方案 · C2-同步贪心

**主线**：不搭物理系统与 MQTT，改以单进程 SimPy 仿真作为"物理系统 + 数字孪生"两端；通过"快照 → 重建 → 预测"实现数字孪生对物理状态的同步与 RCT 路径决策。

**决策过程**见 [`decisions-log.md`](./decisions-log.md)。一句话总结：

> 在保留论文核心贡献（RCT 预测驱动路径决策）的前提下，把 MQTT + 双进程通信换成单进程内存调用，把物理系统换成 SimPy 仿真。其余（数字孪生的建模、快照同步、RCT 预测、路径决策）完整保留。

## 当前阶段

```
阶段1 · 论文复现  ✅ 完成
阶段2 · Web 可视化 ⏳ 规划中
```

### 任务清单

| # | 任务 | 状态 |
|---|---|---|
| 1 | 检查 Python 环境与依赖 | ✅ |
| 4 | 跑通最小 demo（`run_minimal.py`） | ✅ |
| 5 | Case01 baseline（alternated 策略） | ✅ |
| 6 | Case02 with RCT 同步贪心决策 | ✅ |
| 7 | 生成 Case01/Case02 对比图 | ✅ |
| 8 | 给 components 加事件 hook（Web 准备） | ⏳ |
| 9 | FastAPI + WebSocket 后端 | ⏳ |
| 10 | React + D3 前端可视化 | ⏳ |

## 关键成果

**数据对比**（`5s_determ` 模型，2000 时间单位仿真）：

| 指标 | Case01 (alternated) | Case02 (RCT 同步贪心) | 变化 |
|---|---|---|---|
| 完成件数 | 69 | 80 | **+15.9%** |
| Avg Cycle Time | 300.0 | 276.2 | **−7.9%** |
| Max Cycle Time | **589** | **412** | **−30.0%** |
| Throughput | 0.0353 | 0.0406 | **+15.1%** |
| 孪生决策次数 | 0 | 28 | — |

详细图表与解释见 [`results.md`](./results.md)。

## 仓库产出

```
Digital Twin/
├── run_minimal.py                      ← 最小 SimPy demo（不走 orchestrator）
└── experiments/
    ├── twin_sync.py                    ← 快照 / 重建 / RCT 预测工具
    ├── run_case01.py                   ← Case01 基线
    ├── run_case02_sync.py              ← Case02 同步贪心主循环
    ├── plot_compare.py                 ← 对比图生成
    └── results/
        ├── case01/parts.json           ← 69 个零件 CT 数据
        └── case02/
            ├── parts.json              ← 80 个零件 CT 数据
            └── decisions.json          ← 28 次孪生决策记录

figures/compare/
├── cycle_time_per_part.png             ← Case01 vs Case02 曲线对比
├── kpi_bars.png                        ← KPI 柱对比
├── twin_predictions.png                ← 孪生预测 RCT 随决策时刻
└── gain_histogram.png                  ← 决策 gain 分布
```

## 快速复现

```bash
# 1. 环境（已装则跳过）
python3.11 -m venv .venv
.venv/bin/pip install -e "Digital Twin/dtwinpylib"
.venv/bin/pip install simpy numpy scipy matplotlib natsort paho-mqtt requests ipython

# 2. 跑两组实验
cd "Digital Twin"
../.venv/bin/python experiments/run_case01.py
../.venv/bin/python experiments/run_case02_sync.py

# 3. 出对比图
../.venv/bin/python experiments/plot_compare.py
# 图在 figures/compare/
```

## 与原仓的关系

- **直接复用**：`dtwinpylib.dtwinpy.digital_model.Model`（SimPy 建模、零件流、RCT 计算）、`components`（Machine / Queue / Conveyor / Branch / Part）
- **绕开未使用**：`Digital_Twin` 主循环、`Synchronizer`、`Validator`、`Updator`、`Broker_Manager`、`interfaceAPI`、`tester.Tester`、`allexp_database.db`
- **自己实现**：状态快照 → JSON 重建 → twin 模型 → 多路径 RCT 预测 → 回写决策（`experiments/twin_sync.py` + `run_case02_sync.py`）

只做了一处原仓修改：`dtwinpylib/dtwinpy/helper.py` 把 `from playsound import playsound` 改为 try-import（原代码里调用已注释，但 import 还在，macOS Python 3.11 装不上 playsound 1.3.0）。

## 下一步路线图

见 [`roadmap.md`](./roadmap.md)。阶段 2 的目标：把 `run_case02_sync.py` 的内部流程做成 Web 可视化——车间拓扑图 + 零件动画 + 孪生决策侧栏 + KPI 曲线 + 伪 MQTT 消息流。
