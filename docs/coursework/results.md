# 阶段 1 成果 · Case01 vs Case02

运行配置：
- 模型：`Digital Twin/models/5s_determ/initial.json`
- 仿真时间：2000 单位
- 初始 WIP：Q1 里 12 个零件
- 机器加工时间：M1=11, M2=17, M3=60, M4=38, M5=10
- 分岔点：M2 → {M3, M4}，其中 M4 快 37%

## KPI 对比

| 指标 | Case01 | Case02 | Δ |
|---|---|---|---|
| 完成件数 | 69 | 80 | **+15.9%** |
| Avg Cycle Time | 300.03 | 276.18 | **−7.9%** |
| Max Cycle Time | 589 | 412 | **−30.0%** |
| Min Cycle Time | 131 | 138 | +5.3% |
| Throughput | 0.0353 | 0.0406 | **+15.1%** |
| 孪生决策触发次数 | 0 | 28 | — |

→ **Max CT 降 30% 是最亮眼的指标**——说明 RCT 决策消除了 Case01 里的严重阻塞尾巴。

## 关键图表

### 1. Cycle Time per Part ID —— `figures/compare/cycle_time_per_part.png`

| Case01 | Case02 |
|---|---|
| 蓝线，Part ID 10-60 之间大幅震荡，峰值接近 600 | 橙线，整体平稳，峰值 412，后半段稳定在 150-250 |

与论文 `Real RCT both cases.png` 的趋势完全一致：
- Case01 中段出现长长的锯齿震荡（零件被轮到慢的 M3 造成阻塞）
- Case02 有轻微震荡但振幅小、峰值低

### 2. KPI 柱对比 —— `figures/compare/kpi_bars.png`

三对柱（Avg CT、Max CT、Throughput）直观显示 Case02 全面胜出。

### 3. 孪生预测 RCT 随时间 —— `figures/compare/twin_predictions.png`

每个决策点两条路径的孪生预测 finish_time：
- 绿线（最优路径）：决策时孪生预测最小 RCT
- 红线（较差路径）：决策时孪生预测最大 RCT
- **两条线间的差距就是 gain** —— 可以看到几乎每次都有明显差距，证明孪生预测是有效的

### 4. Gain 分布 —— `figures/compare/gain_histogram.png`

28 次决策的 gain（相对改善率）分布：
- 多数决策 gain 在 20-50%
- 最大 gain 64%
- 最小 gain 4.6%（仍高于 2% 阈值）

## 决策样本（来自 `experiments/results/case02/decisions.json`）

```json
{
    "t": 90,
    "part_id": 6,
    "rcts": {"3": 262, "4": 115},
    "chosen_conveyor_id": 4,
    "gain_pct": 56.1
}
```

读法：t=90 时，为 Part 6 做决策。孪生预测：走 Q3（→M3）需 262 时间单位，走 Q4（→M4）需 115。选 Q4，gain 56.1%。

## 结论（答辩三要点）

1. **复现成功**：Case01/Case02 趋势与论文一致
2. **孪生机制完整**：主仿真每 30 时间单位暂停 → 快照 WIP → 写 JSON → 重建孪生 → 对每条路径做 targeted 仿真 → 选最小 RCT → 回写主仿真
3. **数字孪生四层能力全覆盖**：数字模型 ✅ / 数字影子（快照同步）✅ / 双向交互（决策写回）✅ / 智能预测（RCT）✅

## 局限与诚实说明

- 状态快照是近似的：机器内/传送带上的零件被"丢"回最近队列（详见 `decisions-log.md#Decision 4`）
- 决策扫描比论文更激进：扫分岔队列里每个未决策零件，而非仅 `queue_position=2`
- 未做 Validator / Updator：本模型参数已知，跳过孪生自校准
- 未走 MQTT：物理系统用 SimPy 仿真替代，通信用 Python 内存调用替代
