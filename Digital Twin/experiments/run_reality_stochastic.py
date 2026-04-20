"""
生成"真实产线"随机仿真事件，作为效率感知检测的数据源。

场景：topology.json 记录的标称节拍（规格书）与真实产线不一致。
  - 规格：M3=60s, M4=38s
  - 真实：M3, M4 实际节拍均服从 N(52.5, 2) —— 模型 5s_stho
检测应看到 M3 实测偏快、M4 实测偏慢。

输出到 experiments/results/case02_stho/。
"""
from __future__ import annotations
import os
import sys
import json

os.environ.setdefault("MPLBACKEND", "Agg")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)
sys.path.insert(0, ROOT)

from dtwinpylib.dtwinpy.digital_model import Model  # noqa: E402
from experiments.events import EventRecorder, install_recorder  # noqa: E402

OUT_DIR = "experiments/results/case02_stho"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs("databases/case02_stho", exist_ok=True)

UNTIL = 2000
MODEL = "models/5s_stho/initial.json"


def main():
    model = Model(
        name="reality_stho",
        model_path=MODEL,
        database_path="databases/case02_stho/digital_database.db",
        initial=True,
        until=UNTIL,
        loop_type="closed",
    )
    model.model_translator()
    rec = EventRecorder()
    install_recorder(model, rec)
    model.run()

    parts = []
    for p in sorted(model.terminator.get_all_items(), key=lambda p: p.get_id()):
        parts.append(
            {
                "id": p.get_id(),
                "creation": p.get_creation(),
                "termination": p.get_termination(),
                "cycle_time": p.get_termination() - p.get_creation(),
            }
        )

    with open(os.path.join(OUT_DIR, "events.json"), "w") as f:
        json.dump(
            {"meta": {"model": MODEL, "until": UNTIL, "loop": "closed"}, "events": rec.events},
            f,
        )
    with open(os.path.join(OUT_DIR, "parts.json"), "w") as f:
        json.dump(parts, f)

    print(f"wrote {len(rec.events)} events, {len(parts)} parts → {OUT_DIR}")


if __name__ == "__main__":
    main()
