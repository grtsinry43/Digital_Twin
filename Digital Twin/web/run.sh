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
  "$VENV_PY" experiments/export_topology.py
  echo "✓ 已写入 experiments/results/{case01,case02,topology.json}"
fi

# 检查事件文件是否齐
for f in topology.json case01/events.json case02/events.json case02/decisions.json; do
  if [[ ! -f "$DT_ROOT/experiments/results/$f" ]]; then
    echo "✗ 缺 $f，请先跑：./web/run.sh --regen"
    exit 1
  fi
done

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

cleanup() {
  echo
  echo "停止 …"
  kill "$BACK_PID" "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait
