"""
FastAPI backend · 离线回放模式

端点：
  GET  /api/topology             车间拓扑 JSON
  GET  /api/events?case=01|02    完整事件流（静态）
  GET  /api/kpi                  两案例 KPI 汇总
  GET  /api/decisions?case=02    决策历史
  WS   /ws/replay?case=01&speed=1.0   按仿真时间定速推事件

启动：
  cd "Digital Twin"
  ../.venv/bin/uvicorn web.backend.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .simulate import BOUNDS, SimulateRequest, run_whatif
from .interventions import append_intervention, list_interventions
from .task_queue import create_task, get_task, list_tasks

ROOT = Path(__file__).resolve().parents[2]  # "Digital Twin/"
RESULTS = ROOT / "experiments" / "results"

app = FastAPI(title="Digital Twin Replay Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_json(path: Path) -> Any:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{path.name} not found (跑对应实验先)")
    with path.open() as f:
        return json.load(f)


def _case_dir(case: str) -> Path:
    case = case.strip().lower().lstrip("0")
    if case not in {"1", "2"}:
        raise HTTPException(status_code=400, detail="case 必须是 01 或 02")
    return RESULTS / f"case0{case}"


# ---------------- REST ----------------

@app.get("/api/topology")
def get_topology():
    return _load_json(RESULTS / "topology.json")


@app.get("/api/events")
def get_events(case: str = Query("02")):
    return _load_json(_case_dir(case) / "events.json")


@app.get("/api/decisions")
def get_decisions(case: str = Query("02")):
    return _load_json(_case_dir(case) / "decisions.json")


@app.get("/api/kpi")
def get_kpi():
    out: Dict[str, Any] = {}
    for label in ("case01", "case02"):
        parts_path = RESULTS / label / "parts.json"
        if not parts_path.exists():
            continue
        parts = json.loads(parts_path.read_text())
        if not parts:
            out[label] = {"count": 0}
            continue
        cts = [p["cycle_time"] for p in parts]
        out[label] = {
            "count": len(parts),
            "avg_ct": sum(cts) / len(cts),
            "min_ct": min(cts),
            "max_ct": max(cts),
            "throughput": len(parts) / parts[-1]["termination"],
            "last_t": parts[-1]["termination"],
        }
    return out


@app.get("/api/health")
def health():
    return {"ok": True, "results_exist": RESULTS.exists()}


# ---------------- What-if + 干预日志 ----------------

@app.get("/api/simulate/bounds")
def simulate_bounds():
    return {"bounds": BOUNDS, "policies": ["alternated", "first"]}


@app.post("/api/simulate")
async def simulate(req: SimulateRequest):
    # 同步：只跑 baseline（快速反馈用）
    result = await run_in_threadpool(run_whatif, req)
    return result


@app.post("/api/simulate/async")
def simulate_async(req: SimulateRequest):
    # 异步：跑 baseline + RCT twin，对比孪生增益
    # 先做参数校验（复用 run_whatif 的 clamp 逻辑）
    from .simulate import _clamp, BOUNDS, ALLOWED_POLICIES
    req.m3_time = _clamp(req.m3_time, BOUNDS["m3_time"], "m3_time")
    req.m4_time = _clamp(req.m4_time, BOUNDS["m4_time"], "m4_time")
    req.q3_capacity = _clamp(req.q3_capacity, BOUNDS["q3_capacity"], "q3_capacity")
    req.q4_capacity = _clamp(req.q4_capacity, BOUNDS["q4_capacity"], "q4_capacity")
    req.horizon = _clamp(req.horizon, BOUNDS["horizon"], "horizon")
    if req.policy not in ALLOWED_POLICIES:
        raise HTTPException(status_code=400, detail=f"policy 只能是 {sorted(ALLOWED_POLICIES)} 其一")

    task_id = create_task(req.model_dump())
    return {"task_id": task_id}


@app.get("/api/simulate/status/{task_id}")
def simulate_status(task_id: str):
    t = get_task(task_id)
    if not t:
        raise HTTPException(status_code=404, detail="task_id 不存在")
    return t


@app.get("/api/simulate/tasks")
def simulate_tasks(limit: int = Query(20, ge=1, le=100)):
    return list_tasks(limit=limit)


@app.get("/api/interventions")
def get_interventions(limit: int = Query(200, ge=1, le=1000)):
    return list_interventions(limit=limit)


@app.post("/api/interventions")
def post_intervention(payload: Dict[str, Any]):
    # payload 要有 operator、params、kpi_before、kpi_after、note
    required = ("operator", "params", "kpi_after")
    for k in required:
        if k not in payload:
            raise HTTPException(status_code=400, detail=f"缺字段 {k}")
    return append_intervention(payload)


# ---------------- WebSocket replay ----------------

@app.websocket("/ws/replay")
async def ws_replay(ws: WebSocket):
    await ws.accept()
    params = ws.query_params
    case = params.get("case", "02")
    try:
        speed = float(params.get("speed", "10"))  # 仿真秒 / 墙钟秒
    except ValueError:
        speed = 10.0

    try:
        payload = _load_json(_case_dir(case) / "events.json")
    except HTTPException as e:
        await ws.send_json({"type": "error", "detail": e.detail})
        await ws.close()
        return

    events = payload["events"]
    await ws.send_json({
        "type": "replay_start",
        "case": case,
        "speed": speed,
        "total_events": len(events),
        "meta": payload.get("meta", {}),
    })

    last_t = 0.0
    try:
        for ev in events:
            t = float(ev.get("t", 0))
            dt = max(0.0, t - last_t)
            last_t = t
            if dt > 0 and speed > 0:
                await asyncio.sleep(dt / speed)
            await ws.send_json(ev)
        await ws.send_json({"type": "replay_end"})
    except WebSocketDisconnect:
        return
    except Exception as e:
        await ws.send_json({"type": "error", "detail": str(e)})
    finally:
        try:
            await ws.close()
        except Exception:
            pass
