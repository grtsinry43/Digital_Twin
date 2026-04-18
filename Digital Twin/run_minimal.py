"""
Minimal demo: run the digital Model directly on 5s_determ/initial.json.
Bypasses Tester / Digital_Twin orchestrator / MQTT / real_log sync.
"""
import os
os.environ.setdefault("MPLBACKEND", "Agg")

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

import matplotlib.pyplot as plt
from dtwinpylib.dtwinpy.digital_model import Model

os.makedirs("databases/minimal", exist_ok=True)
os.makedirs("figures", exist_ok=True)

model = Model(
    name="minimal_5s_determ",
    model_path="models/5s_determ/initial.json",
    database_path="databases/minimal/digital_database.db",
    initial=True,
    until=1000,
    loop_type="closed",
)
model.model_translator()
model.run()

parts = sorted(model.terminator.get_all_items(), key=lambda p: p.get_id())
ids = [p.get_id() for p in parts]
ct = [p.get_termination() - p.get_creation() for p in parts]
ft = [p.get_termination() for p in parts]

print(f"\n>>> Finished parts: {len(parts)}")
print(f">>> Avg CT: {sum(ct)/len(ct):.2f}  Min: {min(ct)}  Max: {max(ct)}")
print(f">>> Throughput: {len(parts)/ft[-1]:.4f} parts/unit")

plt.figure(figsize=(8, 5))
plt.plot(ids, ct, "-x")
plt.title(f"Cycle Time per Part — {model.name}")
plt.xlabel("Part ID"); plt.ylabel("Cycle Time"); plt.grid(True)
plt.savefig(f"figures/{model.name}_cycle_time.png", dpi=120)
plt.close()

plt.figure(figsize=(8, 5))
plt.plot(ids, ft, "-o")
plt.title(f"Lead Time per Part — {model.name}")
plt.xlabel("Part ID"); plt.ylabel("Finish Time"); plt.grid(True)
plt.savefig(f"figures/{model.name}_plot_finished.png", dpi=120)
plt.close()

print("Figures saved under figures/")
print("DONE")
