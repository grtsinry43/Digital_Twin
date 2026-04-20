"""
自动模式看门狗：周期性扫描效率建议，按安全闸门自动批准或跳过。

安全闸门（按顺序检查）：
  1. enabled 开关（kill-switch 即 enabled=False）
  2. mode == "auto"
  3. 单次幅度 ≤ max_auto_pct
  4. 同机器冷却期 cooldown_s（上次 system:auto 调整以来）

配置持久化在 results/efficiency/auto_config.json。
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .suggestions import (
    _read_all,
    decide,
    list_suggestions,
    scan_and_enqueue,
)

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "experiments" / "results" / "efficiency"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = CONFIG_DIR / "auto_config.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "enabled": False,
    "mode": "manual",       # "manual" | "auto"
    "case": "02s",
    "interval_s": 30,
    "max_auto_pct": 20.0,   # 单次自动调整幅度上限
    "cooldown_s": 300,      # 同机器最短自动调整间隔
    "dedup_window_s": 600,  # 扫描去重窗口
    "kill_ts": None,
}

_cfg_lock = threading.RLock()
_state: Dict[str, Any] = {"last_tick_ts": None, "last_result": None, "applied_count": 0}
_worker_started = False


def load_config() -> Dict[str, Any]:
    with _cfg_lock:
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text())
                return {**DEFAULT_CONFIG, **data}
            except Exception:
                pass
        return dict(DEFAULT_CONFIG)


def save_config(patch: Dict[str, Any]) -> Dict[str, Any]:
    with _cfg_lock:
        cfg: Dict[str, Any] = load_config()
        for k, v in patch.items():
            if k in DEFAULT_CONFIG:
                cfg[k] = v
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
        return cfg


def kill_switch() -> Dict[str, Any]:
    return save_config(
        {"enabled": False, "mode": "manual", "kill_ts": int(time.time() * 1000)}
    )


def _last_auto_apply_ts(machine_id: int) -> Optional[int]:
    best: Optional[int] = None
    for r in _read_all():
        if r.get("machine_id") != machine_id:
            continue
        if not (r.get("decided_by") or "").startswith("system:auto"):
            continue
        ts = r.get("decided_ts")
        if ts and (best is None or ts > best):
            best = ts
    return best


def tick() -> Dict[str, Any]:
    cfg = load_config()
    now_ms = int(time.time() * 1000)
    result: Dict[str, Any] = {
        "ts": now_ms,
        "cfg": cfg,
        "added": 0,
        "applied": [],
        "skipped": [],
        "note": None,
    }
    if not cfg["enabled"]:
        result["note"] = "auto 总开关关闭"
        _state["last_tick_ts"] = now_ms
        _state["last_result"] = result
        return result
    if cfg["mode"] != "auto":
        result["note"] = "当前是 manual 模式"
        _state["last_tick_ts"] = now_ms
        _state["last_result"] = result
        return result

    scan = scan_and_enqueue(cfg["case"], dedup_window_s=int(cfg["dedup_window_s"]))
    result["added"] = scan["added"]

    for s in list_suggestions("pending"):
        mid = s["machine_id"]
        delta = abs(float(s.get("delta_pct", 0.0)))
        if delta > float(cfg["max_auto_pct"]):
            result["skipped"].append(
                {"id": s["id"], "reason": f"幅度 {s['delta_pct']:+.1f}% 超过 ±{cfg['max_auto_pct']}%"}
            )
            continue
        last_ts = _last_auto_apply_ts(mid)
        if last_ts and (now_ms - last_ts) / 1000 < float(cfg["cooldown_s"]):
            remain = int(float(cfg["cooldown_s"]) - (now_ms - last_ts) / 1000)
            result["skipped"].append(
                {"id": s["id"], "reason": f"M{mid} 冷却中，剩余 {remain}s"}
            )
            continue
        try:
            rec = decide(
                s["id"],
                "approve",
                operator="system:auto",
                note=f"auto@{cfg['case']} · |Δ|={delta:.1f}% · cap={cfg['max_auto_pct']}%",
            )
            result["applied"].append(rec)
            _state["applied_count"] += 1
        except Exception as e:
            result["skipped"].append({"id": s["id"], "reason": f"apply 异常: {e}"})

    _state["last_tick_ts"] = now_ms
    _state["last_result"] = result
    return result


def _worker() -> None:
    while True:
        try:
            cfg = load_config()
            interval = max(5, int(cfg.get("interval_s", 30)))
            time.sleep(interval)
            if cfg.get("enabled") and cfg.get("mode") == "auto":
                tick()
        except Exception as e:  # noqa: BLE001
            print(f"[efficiency-auto] worker error: {e}")
            time.sleep(5)


def start_worker() -> None:
    global _worker_started
    if _worker_started:
        return
    _worker_started = True
    threading.Thread(target=_worker, daemon=True, name="efficiency-auto-watcher").start()


def state() -> Dict[str, Any]:
    return {
        "cfg": load_config(),
        "last_tick_ts": _state["last_tick_ts"],
        "applied_count": _state["applied_count"],
        "last_result": _state["last_result"],
        "worker_running": _worker_started,
    }
