#!/usr/bin/env bash
# Digital Twin · Web 演示一键启动
#
# 用法：
#   ./web/run.sh             # 假设事件已生成，直接起 backend + frontend
#   ./web/run.sh --regen     # 先重跑 case01/case02 + 导出 topology，再起服务
#
# 依赖：
#   - .venv 已建好（项目根的 .venv），含 simpy / fastapi / uvicorn / dtwinpy
#   - 前端 pnpm install 已执行过
#
# 退出：Ctrl+C 会一并停掉前后端

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../Digital Twin/web
DT_ROOT="$(cd "$HERE/.." && pwd)"                      # .../Digital Twin
REPO_ROOT="$(cd "$DT_ROOT/.." && pwd)"                 # 仓库根
VENV_PY="$REPO_ROOT/.venv/bin/python"
VENV_UVI="$REPO_ROOT/.venv/bin/uvicorn"

if [[ ! -x "$VENV_PY" ]]; then
  echo "✗ 找不到 venv：$VENV_PY"
  echo "  先在仓库根建虚拟环境：python -m venv .venv && .venv/bin/pip install -r 'Digital Twin/web/backend/requirements.txt'"
  exit 1
fi

if [[ "${1:-}" == "--regen" ]]; then
  echo "▶ 重新生成事件流 + 拓扑"
  cd "$DT_ROOT"
  "$VENV_PY" experiments/run_case01.py
  "$VENV_PY" experiments/run_case02_sync.py
  "$VENV_PY" experiments/run_reality_stochastic.py
  "$VENV_PY" experiments/export_topology.py
  echo "✓ 已写入 experiments/results/{case01,case02,case02_stho,topology.json}"
fi

# 检查事件文件是否齐
for f in topology.json case01/events.json case02/events.json case02/decisions.json; do
  if [[ ! -f "$DT_ROOT/experiments/results/$f" ]]; then
    echo "✗ 缺 $f，请先跑：./web/run.sh --regen"
    exit 1
  fi
done

# ── banner：等 vite 清屏+就绪后再打印，避免被日志挡掉 ──
print_banner() {
  local target_port=5173
  # 等 vite 把 5173 监听起来（同时也意味着它清过屏、打完自己的 ready 行）
  for _ in $(seq 1 60); do
    if curl -sSf -o /dev/null "http://127.0.0.1:${target_port}" 2>/dev/null; then
      break
    fi
    sleep 0.4
  done
  sleep 0.3  # 再等 vite 完成 ready 行输出

  if [[ -t 1 ]]; then
    local C1=$'\033[38;5;45m' C2=$'\033[38;5;48m' C3=$'\033[38;5;214m'
    local CD=$'\033[38;5;240m' CB=$'\033[1m' CR=$'\033[0m'
  else
    local C1="" C2="" C3="" CD="" CB="" CR=""
  fi

  cat <<BANNER

${C1}   ██████╗ ██╗ ██████╗ ██╗████████╗ █████╗ ██╗        ████████╗██╗    ██╗██╗███╗   ██╗
   ██╔══██╗██║██╔════╝ ██║╚══██╔══╝██╔══██╗██║        ╚══██╔══╝██║    ██║██║████╗  ██║
   ██║  ██║██║██║  ███╗██║   ██║   ███████║██║           ██║   ██║ █╗ ██║██║██╔██╗ ██║
   ██║  ██║██║██║   ██║██║   ██║   ██╔══██║██║           ██║   ██║███╗██║██║██║╚██╗██║
   ██████╔╝██║╚██████╔╝██║   ██║   ██║  ██║███████╗      ██║   ╚███╔███╔╝██║██║ ╚████║
   ╚═════╝ ╚═╝ ╚═════╝ ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝      ╚═╝    ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝${CR}

${CD}   ┌──────────────────────────────────────────────────────────────────────────────┐${CR}
${CD}   │${CR} ${CB}基于 RCT 预测的生产路径控制${CR} ${CD}·${CR} ${C2}SimPy · FastAPI · React · Blueprint${CR}                ${CD}│${CR}
${CD}   │${CR} ${C3}看板大屏${CR} ${CD}·${CR} ${C3}调度决策${CR} ${CD}·${CR} ${C3}效率感知${CR}   ${CD}│${CR}  ${CD}孪生同步 · 可信度检验 · 自动熔断${CR}   ${CD}│${CR}
${CD}   └──────────────────────────────────────────────────────────────────────────────┘${CR}
   ${CD}backend${CR}  ${C2}http://127.0.0.1:8000${CR}     ${CD}frontend${CR}  ${C2}http://127.0.0.1:5173${CR}

BANNER
}

# 后端
cd "$DT_ROOT"
"$VENV_UVI" web.backend.main:app --host 127.0.0.1 --port 8000 --reload &
BACK_PID=$!
echo "▶ FastAPI  pid=$BACK_PID  http://127.0.0.1:8000"

# 前端
cd "$DT_ROOT/web/frontend"
pnpm dev --host 127.0.0.1 --port 5173 &
FRONT_PID=$!
echo "▶ Vite     pid=$FRONT_PID  http://127.0.0.1:5173"

# 就绪后延迟打印 banner（vite 清屏完成后才可见）
(print_banner) &
BANNER_PID=$!

cleanup() {
  echo
  echo "停止 …"
  kill "$BACK_PID" "$FRONT_PID" "$BANNER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait "$BACK_PID" "$FRONT_PID"
