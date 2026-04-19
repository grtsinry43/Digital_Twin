"""
内存里的任务队列（单进程演示用）：
  create_task(params) → task_id
  get_task(task_id)   → TaskState 字典
后台线程跑 baseline + twin，写回 stage/progress/result。
"""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from typing import Any, Dict, Optional

from .twin_sim import run_baseline, run_twin

# task_id → state
_tasks: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _update(task_id: str, **fields):
    with _lock:
        t = _tasks.get(task_id)
        if not t:
            return
        t.update(fields)
        t["updated_ts"] = time.time()


def _run(task_id: str, params: Dict[str, Any]):
    try:
        _update(task_id, status="running", stage="baseline", progress=0.0)

        def base_cb(pct: float, label: str):
            # baseline 占总进度的 0-10%
            _update(task_id, stage=f"baseline · {label}", progress=pct * 0.1)

        baseline = run_baseline(params, progress=base_cb)

        def twin_cb(pct: float, label: str):
            # twin 占 10-100%
            _update(task_id, stage=f"twin · {label}", progress=0.1 + pct * 0.9)

        twin = run_twin(params, progress=twin_cb)

        gain = _compute_gain(baseline["kpi"], twin["kpi"])
        _update(
            task_id,
            status="done",
            stage="完成",
            progress=1.0,
            result={
                "params": params,
                "baseline": baseline,
                "twin": twin,
                "gain": gain,
            },
        )
    except Exception as e:
        _update(
            task_id,
            status="error",
            stage="异常",
            error=f"{type(e).__name__}: {e}",
            traceback=traceback.format_exc()[-2000:],
        )


def _compute_gain(base: Dict[str, Any], twin: Dict[str, Any]) -> Dict[str, Any]:
    def pct(a, b):
        return ((b - a) / a * 100) if a else 0

    return {
        "delta_avg_ct": twin["avg_ct"] - base["avg_ct"],
        "delta_avg_ct_pct": pct(base["avg_ct"], twin["avg_ct"]),
        "delta_throughput": twin["throughput"] - base["throughput"],
        "delta_throughput_pct": pct(base["throughput"], twin["throughput"]),
        "delta_count": twin["count"] - base["count"],
    }


def create_task(params: Dict[str, Any]) -> str:
    task_id = uuid.uuid4().hex[:12]
    with _lock:
        _tasks[task_id] = {
            "id": task_id,
            "status": "pending",
            "stage": "排队",
            "progress": 0.0,
            "params": params,
            "created_ts": time.time(),
            "updated_ts": time.time(),
            "result": None,
            "error": None,
        }
    th = threading.Thread(target=_run, args=(task_id, params), daemon=True)
    th.start()
    return task_id


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        t = _tasks.get(task_id)
        return dict(t) if t else None


def list_tasks(limit: int = 20) -> list:
    with _lock:
        items = sorted(_tasks.values(), key=lambda x: x["created_ts"], reverse=True)[:limit]
        return [dict(x) for x in items]
