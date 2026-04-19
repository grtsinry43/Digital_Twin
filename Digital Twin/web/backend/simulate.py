"""
What-if 短仿真 · 只跑 alternated / first 基线策略（RCT 同步贪心耗时太长，不在 HTTP 同步路径里跑）。
厂长改 M3/M4 工时、Q3/Q4 容量、策略、horizon，返回 KPI + 机器利用率。
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]  # "Digital Twin/"
BASE_MODEL = ROOT / "models" / "5s_determ" / "initial.json"

# 参数硬约束（最后一道防线，前端也做）
BOUNDS = {
    "m3_time": (10, 200),
    "m4_time": (10, 200),
    "q3_capacity": (1, 50),
    "q4_capacity": (1, 50),
    "horizon": (200, 5000),
}
ALLOWED_POLICIES = {"alternated", "first"}


class SimulateRequest(BaseModel):
    m3_time: int = Field(60, description="M3 处理时间 s")
    m4_time: int = Field(38, description="M4 处理时间 s")
    q3_capacity: int = Field(10, description="Q3 (M2→M3) 队列容量")
    q4_capacity: int = Field(10, description="Q4 (M2→M4) 队列容量")
    policy: str = Field("alternated", description="alternated | first")
    horizon: int = Field(2000, description="仿真 horizon")


def _clamp(v: int, bounds: tuple[int, int], name: str) -> int:
    lo, hi = bounds
    if not isinstance(v, int) or v < lo or v > hi:
        raise HTTPException(status_code=400, detail=f"{name} 必须在 [{lo}, {hi}] 之间（收到 {v}）")
    return v


def _patch_model(req: SimulateRequest) -> str:
    base = json.loads(BASE_MODEL.read_text())
    for n in base["nodes"]:
        if n["activity"] == 3:
            n["contemp"] = req.m3_time
        elif n["activity"] == 4:
            n["contemp"] = req.m4_time
    for a in base["arcs"]:
        pair = a.get("arc", [None, None])
        if pair == [2, 3]:
            a["capacity"] = req.q3_capacity
        elif pair == [2, 4]:
            a["capacity"] = req.q4_capacity

    tmp = tempfile.NamedTemporaryFile(prefix="whatif_", suffix=".json", delete=False, dir=str(ROOT / "models"))
    tmp.write(json.dumps(base, indent=2).encode())
    tmp.close()
    return tmp.name


def run_whatif(req: SimulateRequest) -> Dict[str, Any]:
    # 校验
    req.m3_time = _clamp(req.m3_time, BOUNDS["m3_time"], "m3_time")
    req.m4_time = _clamp(req.m4_time, BOUNDS["m4_time"], "m4_time")
    req.q3_capacity = _clamp(req.q3_capacity, BOUNDS["q3_capacity"], "q3_capacity")
    req.q4_capacity = _clamp(req.q4_capacity, BOUNDS["q4_capacity"], "q4_capacity")
    req.horizon = _clamp(req.horizon, BOUNDS["horizon"], "horizon")
    if req.policy not in ALLOWED_POLICIES:
        raise HTTPException(status_code=400, detail=f"policy 只能是 {sorted(ALLOWED_POLICIES)} 其一")

    # 在子进程里跑 dtwinpy 太重；直接在当前进程跑，但换工作目录
    cwd_before = os.getcwd()
    sys.path.insert(0, str(ROOT))
    try:
        os.chdir(str(ROOT))
        from dtwinpylib.dtwinpy.digital_model import Model  # noqa: E402
        from experiments.events import EventRecorder, install_recorder  # noqa: E402

        patched = _patch_model(req)
        db_path = tempfile.mktemp(prefix="whatif_", suffix=".db", dir=str(ROOT / "databases"))
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

        t0 = time.time()
        model = Model(
            name="whatif",
            model_path=os.path.relpath(patched, str(ROOT)),
            database_path=os.path.relpath(db_path, str(ROOT)),
            initial=True,
            until=req.horizon,
            loop_type="closed",
        )
        model.model_translator()

        # 覆盖分支机器 M2 的 allocation_policy
        for m in model.machines_vector:
            if hasattr(m, "allocation_policy") and m.allocation_policy in {"alternated", "first"}:
                m.allocation_policy = req.policy

        rec = EventRecorder()
        install_recorder(model, rec)
        model.run()
        wall = time.time() - t0

        parts = sorted(model.terminator.get_all_items(), key=lambda p: p.get_id())
        cts = [p.get_termination() - p.get_creation() for p in parts]
        last_t = parts[-1].get_termination() if parts else req.horizon
        kpi = {
            "count": len(parts),
            "avg_ct": sum(cts) / len(cts) if cts else 0,
            "min_ct": min(cts) if cts else 0,
            "max_ct": max(cts) if cts else 0,
            "throughput": len(parts) / last_t if last_t > 0 else 0,
            "last_t": last_t,
        }

        # 机器利用率（从事件流里推 busy）
        util = _utilization(rec.events, model, req.horizon)

        # 清理临时文件
        for p in (patched, db_path):
            try:
                os.remove(p)
            except OSError:
                pass

        return {
            "request": req.model_dump(),
            "kpi": kpi,
            "utilization": util,
            "wall_seconds": round(wall, 2),
            "events_count": len(rec.events),
        }
    finally:
        os.chdir(cwd_before)


def _utilization(events: List[Dict[str, Any]], model, horizon: int) -> List[Dict[str, Any]]:
    """从事件流推机器利用率（queue_exit → conveyor_enter 视为 busy）"""
    q2m: Dict[int, int] = {}
    for q in model.queues_vector:
        arc = getattr(q, "arc_links", None) or [None, None]
        to_machine = arc[1] if len(arc) >= 2 else None
        if to_machine is not None:
            q2m[q.id] = to_machine
        else:
            # M5 的入队可能 arc_links=None, 按约定 queue_id == to_machine
            q2m[q.id] = q.id

    busy = {m.id: 0.0 for m in model.machines_vector}
    pending: Dict[int, tuple[int, float]] = {}  # machine_id -> (part_id, start_t)
    for ev in events:
        t = ev["t"]
        if ev["type"] == "queue_exit":
            mid = q2m.get(ev["queue_id"])
            if mid is not None:
                pending[mid] = (ev["part_id"], t)
        elif ev["type"] == "conveyor_enter":
            for mid, (pid, start) in list(pending.items()):
                if pid == ev["part_id"]:
                    busy[mid] = busy.get(mid, 0.0) + (t - start)
                    del pending[mid]
                    break
    # 还在机器里没出完的补齐
    for mid, (_pid, start) in pending.items():
        busy[mid] = busy.get(mid, 0.0) + max(0, horizon - start)

    return [
        {
            "machine_id": m.id,
            "busy": round(busy.get(m.id, 0.0), 2),
            "pct": round((busy.get(m.id, 0.0) / horizon) * 100, 2) if horizon > 0 else 0,
        }
        for m in model.machines_vector
    ]
