"""
干预日志 · 追加写入 JSONL。每条记录：
  { id, ts, operator, params, kpi_before, kpi_after, note }
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[2]  # "Digital Twin/"
LOG_DIR = ROOT / "experiments" / "results" / "interventions"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "log.jsonl"

_lock = threading.Lock()


def _next_id() -> int:
    if not LOG_FILE.exists():
        return 1
    with LOG_FILE.open() as f:
        last_id = 0
        for line in f:
            try:
                last_id = max(last_id, int(json.loads(line).get("id", 0)))
            except (ValueError, json.JSONDecodeError):
                pass
    return last_id + 1


def append_intervention(payload: Dict[str, Any]) -> Dict[str, Any]:
    with _lock:
        record = {
            "id": _next_id(),
            "ts": int(time.time() * 1000),
            "operator": str(payload.get("operator", "unknown")),
            "params": payload.get("params", {}),
            "kpi_before": payload.get("kpi_before"),
            "kpi_after": payload.get("kpi_after"),
            "note": str(payload.get("note", ""))[:500],
        }
        with LOG_FILE.open("a") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def list_interventions(limit: int = 200) -> List[Dict[str, Any]]:
    if not LOG_FILE.exists():
        return []
    records: List[Dict[str, Any]] = []
    with LOG_FILE.open() as f:
        for line in f:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    records.sort(key=lambda r: r.get("id", 0), reverse=True)
    return records[:limit]
