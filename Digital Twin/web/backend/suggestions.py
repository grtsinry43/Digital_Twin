"""
建议队列（人工监管流程）· JSONL 持久化。

状态机：pending → approved | rejected | modified | ignored
- 扫描时若同 (machine_id, param) 存在 pending，跳过（去重）。
- approve/modify 同时往 interventions 日志追加一条审批记录，operator 带审批人。
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .efficiency import analyze, build_suggestions
from .interventions import append_intervention

ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = ROOT / "experiments" / "results" / "efficiency"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "suggestions.jsonl"

_lock = threading.Lock()


def _read_all() -> List[Dict[str, Any]]:
    if not LOG_FILE.exists():
        return []
    out: List[Dict[str, Any]] = []
    with LOG_FILE.open() as f:
        for line in f:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def _write_all(records: List[Dict[str, Any]]) -> None:
    tmp = LOG_FILE.with_suffix(".tmp")
    with tmp.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    tmp.replace(LOG_FILE)


def _next_id(records: List[Dict[str, Any]]) -> int:
    return (max((r.get("id", 0) for r in records), default=0)) + 1


def list_suggestions(status_filter: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    recs = _read_all()
    if status_filter:
        recs = [r for r in recs if r.get("status") == status_filter]
    recs.sort(key=lambda r: r.get("id", 0), reverse=True)
    return recs[:limit]


def scan_and_enqueue(case: str = "02", dedup_window_s: int = 600) -> Dict[str, Any]:
    """扫描当前效率状态，把显著偏移的机器入队。
    去重：近 dedup_window_s 秒内已有同 (machine_id, param) 且未被拒绝的记录则跳过。
    """
    status = analyze(case)
    candidates = build_suggestions(status)
    now_ms = int(time.time() * 1000)
    with _lock:
        records = _read_all()
        recent_keys: set[tuple[int, str]] = set()
        for r in records:
            if r.get("status") == "rejected":
                continue
            if now_ms - r.get("ts", 0) > dedup_window_s * 1000:
                continue
            recent_keys.add((r.get("machine_id"), r.get("param")))
        added: List[Dict[str, Any]] = []
        for c in candidates:
            key = (c["machine_id"], c["param"])
            if key in recent_keys:
                continue
            rec = {
                "id": _next_id(records + added),
                "ts": now_ms,
                "status": "pending",
                "case": case,
                **c,
            }
            added.append(rec)
        if added:
            with LOG_FILE.open("a") as f:
                for r in added:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return {"added": len(added), "suggestions": added, "status": status}


def _find(record_id: int) -> tuple[List[Dict[str, Any]], int]:
    records = _read_all()
    for i, r in enumerate(records):
        if r.get("id") == record_id:
            return records, i
    raise KeyError(record_id)


def decide(
    record_id: int,
    action: str,
    operator: str,
    note: str = "",
    new_to: Optional[int] = None,
) -> Dict[str, Any]:
    assert action in {"approve", "reject", "modify", "ignore"}, f"bad action: {action}"
    with _lock:
        records, idx = _find(record_id)
        rec = records[idx]
        if rec.get("status") != "pending":
            raise ValueError(f"建议 #{record_id} 已是 {rec.get('status')}，不能再操作")
        rec["decided_by"] = operator
        rec["decided_ts"] = int(time.time() * 1000)
        rec["decide_note"] = str(note)[:300]

        if action == "approve":
            rec["status"] = "approved"
            rec["applied_to"] = rec["to"]
        elif action == "modify":
            if new_to is None:
                raise ValueError("modify 必须带 new_to")
            rec["status"] = "modified"
            rec["applied_to"] = int(new_to)
        elif action == "reject":
            rec["status"] = "rejected"
            rec["applied_to"] = None
        else:  # ignore
            rec["status"] = "ignored"
            rec["applied_to"] = None

        records[idx] = rec
        _write_all(records)

    # approve/modify 写入干预审计
    if rec["status"] in {"approved", "modified"}:
        applied_value = rec["applied_to"]
        append_intervention(
            {
                "operator": f"{operator} (suggestion #{rec['id']})",
                "params": {
                    "source": "efficiency_suggestion",
                    "machine_id": rec["machine_id"],
                    "param": rec["param"],
                    "from": rec["from"],
                    "to": applied_value,
                },
                "kpi_before": None,
                "kpi_after": {
                    "count": 0,
                    "avg_ct": 0,
                    "min_ct": 0,
                    "max_ct": 0,
                    "throughput": 0,
                    "last_t": 0,
                },
                "note": (
                    f"采纳建议：{rec['label']} {rec['param']} {rec['from']} → {applied_value} "
                    f"({rec['delta_pct']:+.1f}%)。{note}"
                )[:500],
            }
        )
    return rec
