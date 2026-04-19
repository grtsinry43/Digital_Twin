"""
Case01: baseline with default alternated policy at branching machine M2.
No RCT service. Records per-part cycle time + RCT for later comparison.
"""
import os, sys, json
os.environ.setdefault("MPLBACKEND", "Agg")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)
sys.path.insert(0, ROOT)

import matplotlib.pyplot as plt
from dtwinpylib.dtwinpy.digital_model import Model
from experiments.events import EventRecorder, install_recorder

OUT_DIR = "experiments/results/case01"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs("databases/case01", exist_ok=True)
os.makedirs("figures/compare", exist_ok=True)

UNTIL = 2000

model = Model(
    name="case01",
    model_path="models/5s_determ/initial.json",
    database_path="databases/case01/digital_database.db",
    initial=True,
    until=UNTIL,
    loop_type="closed",
)
model.model_translator()

recorder = EventRecorder()
install_recorder(model, recorder)

print(f"Machines: {[m.get_name() for m in model.machines_vector]}")
print(f"Branches: {[b.get_name() for b in model.branches]}")
print(f"Default policy: {model.machines_vector[1].allocation_policy}")  # M2

model.run()

parts = sorted(model.terminator.get_all_items(), key=lambda p: p.get_id())
records = [
    {
        "part_id": p.get_id(),
        "creation": p.get_creation(),
        "termination": p.get_termination(),
        "cycle_time": p.get_termination() - p.get_creation(),
    }
    for p in parts
]

with open(f"{OUT_DIR}/parts.json", "w") as f:
    json.dump(records, f, indent=2)

recorder.dump(f"{OUT_DIR}/events.json", meta={
    "case": "case01",
    "until": UNTIL,
    "model_path": "models/5s_determ/initial.json",
})

avg_ct = sum(r["cycle_time"] for r in records) / len(records)
th = len(records) / records[-1]["termination"]

print(f"\n=== Case01 Results ===")
print(f"Parts finished: {len(records)}")
print(f"Avg CT: {avg_ct:.2f}  Min: {min(r['cycle_time'] for r in records)}  Max: {max(r['cycle_time'] for r in records)}")
print(f"Throughput: {th:.4f}")
print(f"Saved {len(records)} records to {OUT_DIR}/parts.json")
