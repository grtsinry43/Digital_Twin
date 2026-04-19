# Web 可视化（离线回放模式）

## 后端 · FastAPI

**启动**：

```bash
cd "Digital Twin"
../.venv/bin/uvicorn web.backend.main:app --reload --port 8000
```

依赖（已装）：`fastapi uvicorn[standard] websockets`。
重装：`pip install -r web/backend/requirements.txt`。

**前置**：必须先跑完实验产出 JSON：

```bash
../.venv/bin/python experiments/export_topology.py
../.venv/bin/python experiments/run_case01.py
../.venv/bin/python experiments/run_case02_sync.py
```

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/topology` | 车间拓扑 + 坐标 |
| GET | `/api/events?case=01\|02` | 完整事件流（一次性返回，~150 KB） |
| GET | `/api/decisions?case=02` | 决策历史摘录 |
| GET | `/api/kpi` | 两 Case 的 KPI 汇总 |
| WS | `/ws/replay?case=02&speed=10` | 按仿真时间定速推事件 |

### WS 回放协议

客户端连上后立即收到一条 `{"type":"replay_start", ...}`，之后按事件原始 `t` 字段**定速**推出每一条事件（仿真秒 / 墙钟秒 = `speed`，默认 10）。流结束发 `{"type":"replay_end"}` 后服务端主动关闭。

**速度建议**：
- 答辩演示：`speed=20`（2000 仿真秒 ≈ 100 秒墙钟）
- 调试：`speed=100` 甚至 `500`
- 慢动作看决策：`speed=2`

## 数据字段字典

见 `../docs/coursework/events-schema.md`。

## 下一步 · 前端

`web/frontend/` 还没建。计划 Vite + React + TS + D3，走 `/ws/replay` 订阅，拓扑用 `/api/topology`，KPI 汇总用 `/api/kpi`。见 `../docs/coursework/roadmap.md` Task 10。
