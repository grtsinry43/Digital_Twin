# Runbook · 如何跑起来

假设仓库根目录 `/Users/.../Digital_Twin/`，`Digital Twin/` 是核心子目录（注意空格）。

## 一次性环境搭建

```bash
cd /Users/grtsinry43/studyProjs/Digital_Twin

# 创建 Python 3.11 venv
python3.11 -m venv .venv

# 装依赖
.venv/bin/pip install simpy numpy scipy matplotlib natsort paho-mqtt requests ipython

# 本地安装 dtwinpy 包（editable）
cd "Digital Twin/dtwinpylib" && ../../.venv/bin/pip install -e . && cd ../..
```

## 跑最小 demo（验证环境）

```bash
cd "Digital Twin"
../.venv/bin/python run_minimal.py
# 预期输出：37 parts finished, Avg CT 259.73, 图存到 figures/
```

## 跑论文复现实验

```bash
cd "Digital Twin"

# Case01 基线
../.venv/bin/python experiments/run_case01.py
# → 69 parts, Avg CT 300.03, Max 589

# Case02 同步贪心（跑得稍慢，约 1-2 分钟，因为每次决策要跑多个孪生仿真）
../.venv/bin/python experiments/run_case02_sync.py
# → 80 parts, Avg CT 276.18, Max 412, 28 次决策

# 出对比图
../.venv/bin/python experiments/plot_compare.py
# → figures/compare/ 下 4 张 PNG
```

## 重跑干净实验

```bash
cd "Digital Twin"
rm -rf databases/case01 databases/case02 experiments/results figures/compare
# 然后重跑上面的 3 个脚本
```

## 关键文件指路

| 想看 ... | 打开 ... |
|---|---|
| 决策历史 | `docs/coursework/decisions-log.md` |
| 数字对比结果 | `docs/coursework/results.md` |
| 后续路线 | `docs/coursework/roadmap.md` |
| 快照 / 重建核心代码 | `Digital Twin/experiments/twin_sync.py` |
| Case02 主循环 | `Digital Twin/experiments/run_case02_sync.py` |
| 原论文 PDF | `A_Digital_Twin_for_Production_Control_Based_on_Remaining_Cycle_Time_Prediction.pdf` |
| 原仓模块技术报告 | `docs/0001-*.md` 到 `docs/0008-*.md` |

## 常见坑

- **ModuleNotFoundError: No module named 'dtwinpylib'** —— venv 没用，或没装 editable 包。检查 `.venv/bin/pip list | grep dtwinpy`
- **matplotlib 弹窗卡住** —— 脚本已默认 `MPLBACKEND=Agg`（非交互式），不应该发生；若发生检查 `os.environ.setdefault` 行
- **Case02 跑得慢** —— 每个决策要跑 2 次 targeted 孪生仿真；28 次决策 ≈ 56 个短仿真，约 1-2 分钟是正常的
- **playsound 装不上** —— 原仓代码已被我们 try-import 绕开，不需要装

## 打包产物（如需上交）

```bash
# 课设打包建议（不含 .venv）
cd /Users/grtsinry43/studyProjs
tar czf Digital_Twin_coursework.tar.gz \
    --exclude='.venv' --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
    Digital_Twin/
```
