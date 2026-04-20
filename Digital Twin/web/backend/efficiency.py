"""
机器效率变化检测。

从事件流（默认 case02）计算每台机器的实测 service time，
对比 topology 中的标称 process_time，给出偏差/置信区间/粗糙变点。
是无状态纯函数 —— 每次 GET 重算。
"""
from __future__ import annotations

import json
import math
import statistics
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "experiments" / "results"

SIG_THRESHOLD_PCT = 10.0
WATCH_THRESHOLD_PCT = 5.0
MIN_SAMPLES = 20
WINDOW_LAST = 100
ROLLING_W = 20
Z_95 = 1.96
TUNABLE = {3, 4}  # What-if 直接可调的机器


CASE_ALIASES = {
    "01": "case01",
    "02": "case02",
    "02s": "case02_stho",
    "stho": "case02_stho",
}


def _load_events(case: str) -> List[Dict[str, Any]]:
    key = case.strip().lower()
    sub = CASE_ALIASES.get(key, f"case0{key.lstrip('0') or '2'}")
    p = RESULTS / sub / "events.json"
    if not p.exists():
        return []
    return json.loads(p.read_text()).get("events", [])


def _load_topology() -> Dict[str, Any]:
    return json.loads((RESULTS / "topology.json").read_text())


def _service_times(
    events: List[Dict[str, Any]], q2m: Dict[int, int]
) -> Dict[int, List[Tuple[float, float]]]:
    pending: Dict[Tuple[int, int], float] = {}
    out: Dict[int, List[Tuple[float, float]]] = {}
    for ev in events:
        et = ev.get("type")
        if et == "queue_exit":
            mid = q2m.get(ev["queue_id"])
            if mid is None:
                continue
            pending[(ev["part_id"], mid)] = ev["t"]
        elif et in ("conveyor_enter", "terminate"):
            # conveyor_enter：中间机器释放；terminate：末端机器（M5）释放
            pid = ev["part_id"]
            for key in list(pending.keys()):
                if key[0] == pid:
                    t0 = pending.pop(key)
                    mid = key[1]
                    out.setdefault(mid, []).append((t0, ev["t"] - t0))
                    break
    return out


def _stats(samples: List[float]) -> Dict[str, float]:
    n = len(samples)
    if n == 0:
        return {"n": 0, "mean": 0.0, "median": 0.0, "std": 0.0, "ci_low": 0.0, "ci_high": 0.0}
    if n == 1:
        v = samples[0]
        return {"n": 1, "mean": v, "median": v, "std": 0.0, "ci_low": v, "ci_high": v}
    mu = statistics.fmean(samples)
    md = statistics.median(samples)
    sd = statistics.stdev(samples)
    half = Z_95 * sd / math.sqrt(n)
    return {"n": n, "mean": mu, "median": md, "std": sd, "ci_low": mu - half, "ci_high": mu + half}


def _changepoint(series: List[Tuple[float, float]]) -> Optional[float]:
    n = len(series)
    if n < 40:
        return None
    half = n // 2
    a = [s for _, s in series[:half]]
    b = [s for _, s in series[half:]]
    mu_a, mu_b = statistics.fmean(a), statistics.fmean(b)
    va = statistics.pvariance(a) or 1e-6
    vb = statistics.pvariance(b) or 1e-6
    z = (mu_b - mu_a) / math.sqrt(va / len(a) + vb / len(b))
    if abs(z) < 2.0:
        return None
    return float(series[half][0])


def _rolling(series: List[Tuple[float, float]], w: int = ROLLING_W, keep_last: int = 60) -> List[Dict[str, float]]:
    out: List[Dict[str, float]] = []
    for i in range(len(series)):
        lo = max(0, i - w + 1)
        win = [s for _, s in series[lo : i + 1]]
        out.append({"t": round(series[i][0], 2), "mean": round(statistics.fmean(win), 2)})
    return out[-keep_last:]


def analyze(case: str = "02") -> Dict[str, Any]:
    topo = _load_topology()
    events = _load_events(case)
    q2m = {q["id"]: q["to_machine"] for q in topo["queues"]}
    st = _service_times(events, q2m)

    nominal_by_id = {m["id"]: float(m["process_time"]) for m in topo["machines"]}
    label_by_id = {m["id"]: m["label"] for m in topo["machines"]}

    machines: List[Dict[str, Any]] = []
    for mid, nominal in sorted(nominal_by_id.items()):
        series = st.get(mid, [])
        samples = [s for _, s in series][-WINDOW_LAST:]
        s = _stats(samples)
        delta_pct = ((s["mean"] - nominal) / nominal * 100) if nominal > 0 else 0.0
        ci_excludes_nominal = nominal < s["ci_low"] or nominal > s["ci_high"]
        significant = (
            s["n"] >= MIN_SAMPLES
            and abs(delta_pct) >= SIG_THRESHOLD_PCT
            and ci_excludes_nominal
        )
        if significant:
            state = "drift"
        elif s["n"] >= MIN_SAMPLES and abs(delta_pct) >= WATCH_THRESHOLD_PCT:
            state = "watch"
        else:
            state = "ok"
        machines.append(
            {
                "machine_id": mid,
                "label": label_by_id[mid],
                "nominal": nominal,
                "measured_mean": round(s["mean"], 2),
                "measured_median": round(s["median"], 2),
                "std": round(s["std"], 2),
                "n": s["n"],
                "ci_low": round(s["ci_low"], 2),
                "ci_high": round(s["ci_high"], 2),
                "delta_pct": round(delta_pct, 2),
                "direction": "slower" if delta_pct > 0 else ("faster" if delta_pct < 0 else "flat"),
                "significant": significant,
                "state": state,
                "changepoint_t": _changepoint(series),
                "rolling": _rolling(series),
                "tunable": mid in TUNABLE,
            }
        )
    return {
        "case": case,
        "thresholds": {
            "sig_pct": SIG_THRESHOLD_PCT,
            "watch_pct": WATCH_THRESHOLD_PCT,
            "min_samples": MIN_SAMPLES,
            "window_last": WINDOW_LAST,
        },
        "machines": machines,
    }


def build_suggestions(status: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in status["machines"]:
        if not m["significant"] or not m["tunable"]:
            continue
        mid = m["machine_id"]
        new_to = int(round(m["measured_mean"]))
        out.append(
            {
                "machine_id": mid,
                "label": m["label"],
                "kind": "retune_nominal",
                "param": f"m{mid}_time",
                "from": int(m["nominal"]),
                "to": new_to,
                "delta_pct": m["delta_pct"],
                "direction": m["direction"],
                "reason": (
                    f"{m['label']} 实测 {m['measured_mean']}s（n={m['n']}, "
                    f"CI={m['ci_low']}–{m['ci_high']}），偏离标称 {m['delta_pct']:+.1f}%"
                ),
                "evidence": {
                    "nominal": m["nominal"],
                    "measured_mean": m["measured_mean"],
                    "ci": [m["ci_low"], m["ci_high"]],
                    "n": m["n"],
                    "changepoint_t": m["changepoint_t"],
                },
            }
        )
    return out
