"""
What-if 的"双跑"引擎：同一组参数下，分别跑
  baseline (alternated/first)  —— 约 0.1s
  twin (RCT 同步贪心)           —— 约 10–60s
对比 KPI 展示孪生增益。提供进度回调用于异步任务。
"""
from __future__ import annotations

import contextlib
import json
import os
import sys
import tempfile
import time
import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[2]  # "Digital Twin/"
BASE_MODEL = ROOT / "models" / "5s_determ" / "initial.json"

_import_lock = threading.Lock()  # dtwinpy 的 model_translator 动了全局状态，别并发


def patch_model_json(params: Dict[str, Any]) -> str:
    """把参数写进一份临时 model JSON，返回相对 ROOT 的路径。"""
    base = json.loads(BASE_MODEL.read_text())
    for n in base["nodes"]:
        if n["activity"] == 3:
            n["contemp"] = params["m3_time"]
        elif n["activity"] == 4:
            n["contemp"] = params["m4_time"]
    for a in base["arcs"]:
        pair = a.get("arc", [None, None])
        if pair == [2, 3]:
            a["capacity"] = params["q3_capacity"]
        elif pair == [2, 4]:
            a["capacity"] = params["q4_capacity"]
    tmp = tempfile.NamedTemporaryFile(
        prefix="whatif_", suffix=".json", delete=False, dir=str(ROOT / "models")
    )
    tmp.write(json.dumps(base, indent=2).encode())
    tmp.close()
    return tmp.name


@contextlib.contextmanager
def _chdir_root():
    prev = os.getcwd()
    try:
        os.chdir(str(ROOT))
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        yield
    finally:
        os.chdir(prev)


def _kpi_from_parts(parts) -> Dict[str, Any]:
    cts = [p.get_termination() - p.get_creation() for p in parts]
    last_t = parts[-1].get_termination() if parts else 0
    return {
        "count": len(parts),
        "avg_ct": sum(cts) / len(cts) if cts else 0,
        "min_ct": min(cts) if cts else 0,
        "max_ct": max(cts) if cts else 0,
        "throughput": len(parts) / last_t if last_t > 0 else 0,
        "last_t": last_t,
    }


def _utilization_from_events(events: List[Dict[str, Any]], model, horizon: int) -> List[Dict[str, Any]]:
    q2m: Dict[int, int] = {}
    for q in model.queues_vector:
        arc = getattr(q, "arc_links", None) or [None, None]
        q2m[q.id] = arc[1] if len(arc) >= 2 and arc[1] is not None else q.id

    busy = {m.id: 0.0 for m in model.machines_vector}
    pending: Dict[int, tuple] = {}
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


# --------------------- Baseline ---------------------

def run_baseline(params: Dict[str, Any], progress: Optional[Callable[[float, str], None]] = None) -> Dict[str, Any]:
    with _import_lock, _chdir_root():
        from dtwinpylib.dtwinpy.digital_model import Model
        from experiments.events import EventRecorder, install_recorder

        patched = patch_model_json(params)
        db_path = tempfile.mktemp(prefix="whatif_base_", suffix=".db", dir=str(ROOT / "databases"))

        t0 = time.time()
        if progress:
            progress(0.0, "baseline 模型构建")
        model = Model(
            name="whatif_base",
            model_path=os.path.relpath(patched, str(ROOT)),
            database_path=os.path.relpath(db_path, str(ROOT)),
            initial=True,
            until=params["horizon"],
            loop_type="closed",
        )
        model.model_translator()
        for mach in model.machines_vector:
            if hasattr(mach, "allocation_policy") and mach.allocation_policy in {"alternated", "first"}:
                mach.allocation_policy = params["policy"]

        rec = EventRecorder()
        install_recorder(model, rec)
        if progress:
            progress(0.4, "baseline 仿真")
        model.run()
        wall = time.time() - t0

        parts = sorted(model.terminator.get_all_items(), key=lambda p: p.get_id())
        kpi = _kpi_from_parts(parts)
        util = _utilization_from_events(rec.events, model, params["horizon"])

        for p in (patched, db_path):
            try:
                os.remove(p)
            except OSError:
                pass
        if progress:
            progress(1.0, "baseline 完成")
        return {
            "kpi": kpi,
            "utilization": util,
            "wall_seconds": round(wall, 2),
            "events_count": len(rec.events),
            "decisions": 0,
        }


# --------------------- RCT 同步贪心 ---------------------

# 从 experiments/run_case02_sync.py 精简移植，参数化 + 进度回调
DECISION_STEP = 30
QUEUE_POSITION = 2
RCT_THRESHOLD = 0.02
TWIN_UNTIL_CAP = 6000


def run_twin(params: Dict[str, Any], progress: Optional[Callable[[float, str], None]] = None) -> Dict[str, Any]:
    with _import_lock, _chdir_root():
        from dtwinpylib.dtwinpy.digital_model import Model
        from experiments.events import EventRecorder, install_recorder
        from experiments.twin_sync import (
            snapshot_wip, write_twin_json, build_twin_model,
            run_twin_for_rct, get_branch_options, parts_at_decision_position,
        )

        patched = patch_model_json(params)
        patched_rel = os.path.relpath(patched, str(ROOT))
        main_db = tempfile.mktemp(prefix="whatif_twin_main_", suffix=".db", dir=str(ROOT / "databases"))
        twin_db_dir = ROOT / "databases" / "whatif_twin"
        twin_db_dir.mkdir(parents=True, exist_ok=True)
        twin_model_dir = ROOT / "models" / "whatif_twin"
        twin_model_dir.mkdir(parents=True, exist_ok=True)

        horizon = params["horizon"]
        t0 = time.time()
        if progress:
            progress(0.0, "twin 模型构建")

        recorder = EventRecorder()
        main = Model(
            name="whatif_twin_main",
            model_path=patched_rel,
            database_path=os.path.relpath(main_db, str(ROOT)),
            initial=True,
            until=None,
            loop_type="closed",
        )
        main.model_translator()
        install_recorder(main, recorder)
        main.Database.clear(main.event_table)
        main.Database.initialize(main.event_table)
        for mach in main.machines_vector:
            main.env.process(mach.run())
        for conv in main.conveyors_vector:
            main.env.process(conv.run())

        decisions: Dict[int, List[int]] = {}
        branch_options = get_branch_options(main)
        all_conv_by_branch = {b.id: cids for b, cids in branch_options}

        def evaluate(pid: int, cid: int) -> float | None:
            wip = snapshot_wip(main)
            twin_json_path = str(twin_model_dir / f"snap_{pid}_c{cid}.json")
            write_twin_json(patched_rel, wip, twin_json_path)
            twin = build_twin_model(
                twin_json_path=twin_json_path,
                twin_db_path=str(twin_db_dir / f"twin_{pid}_c{cid}.db"),
                targeted_part_id=pid,
                until=TWIN_UNTIL_CAP,
            )
            convs = {c.id: c for c in twin.conveyors_vector}
            for q in twin.queues_vector:
                for p in q.get_all_items():
                    if p.get_id() in decisions:
                        path_ids = decisions[p.get_id()]
                        p.set_branching_path([convs[c] for c in path_ids if c in convs])
            return run_twin_for_rct(twin, pid, [cid])

        t = 0
        n_steps = max(1, horizon // DECISION_STEP)
        step_idx = 0
        while t < horizon:
            t += DECISION_STEP
            if t > horizon:
                t = horizon
            main.env.run(until=t)

            to_decide = parts_at_decision_position(main, queue_position=QUEUE_POSITION, scan_all=True)
            for branch, part in to_decide:
                pid = part.get_id()
                if pid in decisions:
                    continue
                conv_ids = all_conv_by_branch[branch.id]
                recorder.emit({
                    "t": float(main.env.now), "type": "decision_start",
                    "part_id": pid, "branch_id": branch.id, "options": list(conv_ids),
                })
                rcts: Dict[int, Any] = {}
                for cid in conv_ids:
                    try:
                        rcts[cid] = evaluate(pid, cid)
                    except Exception:
                        rcts[cid] = None

                valid = {c: r for c, r in rcts.items() if r is not None}
                if not valid:
                    continue
                best_cid = min(valid, key=valid.get)
                best_rct = valid[best_cid]
                baseline_rct = max(valid.values())
                gain = (baseline_rct - best_rct) / baseline_rct if baseline_rct else 0
                applied = gain >= RCT_THRESHOLD
                if applied:
                    decisions[pid] = [best_cid]
                    main_convs = {c.id: c for c in main.conveyors_vector}
                    part.set_branching_path([main_convs[best_cid]])
                recorder.emit({
                    "t": float(main.env.now), "type": "decision_end",
                    "part_id": pid, "branch_id": branch.id,
                    "rcts": {str(k): v for k, v in rcts.items()},
                    "chosen_conveyor_id": best_cid, "gain_pct": gain * 100,
                    "applied": applied,
                })

            step_idx += 1
            if progress:
                progress(step_idx / n_steps, f"twin 仿真 {step_idx}/{n_steps} · 已决策 {len(decisions)}")

        wall = time.time() - t0
        parts = sorted(main.terminator.get_all_items(), key=lambda p: p.get_id())
        kpi = _kpi_from_parts(parts)
        util = _utilization_from_events(recorder.events, main, horizon)

        # 清理临时文件
        for p in (patched, main_db):
            try:
                os.remove(p)
            except OSError:
                pass
        for d in (twin_db_dir, twin_model_dir):
            for f in d.glob("*"):
                try:
                    f.unlink()
                except OSError:
                    pass

        if progress:
            progress(1.0, f"twin 完成 · {len(decisions)} 次决策")
        return {
            "kpi": kpi,
            "utilization": util,
            "wall_seconds": round(wall, 2),
            "events_count": len(recorder.events),
            "decisions": len(decisions),
        }
