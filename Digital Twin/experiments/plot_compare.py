"""
Generate Case01 vs Case02 comparison plots, mirroring the paper's key figures.
"""
import os, json
os.environ.setdefault("MPLBACKEND", "Agg")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)

import matplotlib.pyplot as plt

os.makedirs("figures/compare", exist_ok=True)

with open("experiments/results/case01/parts.json") as f:
    c1 = json.load(f)
with open("experiments/results/case02/parts.json") as f:
    c2 = json.load(f)
with open("experiments/results/case02/decisions.json") as f:
    decisions = json.load(f)

c1_ids = [r["part_id"] for r in c1]
c1_ct  = [r["cycle_time"] for r in c1]
c2_ids = [r["part_id"] for r in c2]
c2_ct  = [r["cycle_time"] for r in c2]

# --- Plot 1: Cycle Time per Part ID (Case01 vs Case02) ---
plt.figure(figsize=(10, 6))
plt.plot(c1_ids, c1_ct, "-o", color="#1f77b4", label=f"Case 01 (alternated, n={len(c1)})", markersize=4)
plt.plot(c2_ids, c2_ct, "-o", color="#ff7f0e", label=f"Case 02 (RCT twin, n={len(c2)})", markersize=4)
plt.title("Cycle Time per Part ID — Case01 vs Case02")
plt.xlabel("Part ID"); plt.ylabel("Cycle Time")
plt.grid(True, alpha=0.4); plt.legend()
plt.tight_layout()
plt.savefig("figures/compare/cycle_time_per_part.png", dpi=130)
plt.close()

# --- Plot 2: Avg CT / Max CT / Throughput bars ---
def agg(recs):
    cts = [r["cycle_time"] for r in recs]
    t_end = recs[-1]["termination"]
    return {
        "n": len(recs),
        "avg_ct": sum(cts) / len(cts),
        "max_ct": max(cts),
        "min_ct": min(cts),
        "th": len(recs) / t_end,
    }

a1 = agg(c1); a2 = agg(c2)
print("Case01:", a1)
print("Case02:", a2)

import numpy as np
labels = ["Avg CT", "Max CT", "Throughput ×1000"]
c1_vals = [a1["avg_ct"], a1["max_ct"], a1["th"] * 1000]
c2_vals = [a2["avg_ct"], a2["max_ct"], a2["th"] * 1000]
x = np.arange(len(labels))
w = 0.35
plt.figure(figsize=(8, 5))
plt.bar(x - w/2, c1_vals, w, label=f"Case 01 (n={a1['n']})", color="#1f77b4")
plt.bar(x + w/2, c2_vals, w, label=f"Case 02 (n={a2['n']})", color="#ff7f0e")
for i, (v1, v2) in enumerate(zip(c1_vals, c2_vals)):
    plt.text(x[i] - w/2, v1, f"{v1:.1f}", ha="center", va="bottom", fontsize=9)
    plt.text(x[i] + w/2, v2, f"{v2:.1f}", ha="center", va="bottom", fontsize=9)
plt.xticks(x, labels); plt.title("Case01 vs Case02 — Key KPIs")
plt.legend(); plt.grid(True, axis="y", alpha=0.4)
plt.tight_layout()
plt.savefig("figures/compare/kpi_bars.png", dpi=130)
plt.close()

# --- Plot 3: RCT prediction from the twin (per decision) ---
# For each decision: we logged predicted finish_time for each path. Plot min vs max.
if decisions:
    ts = [d["t"] for d in decisions]
    chosen = [min(d["rcts"].values()) for d in decisions]
    rejected = [max(d["rcts"].values()) for d in decisions]
    plt.figure(figsize=(10, 5))
    plt.plot(ts, chosen, "-o", color="#2ca02c", label="Best path predicted RCT")
    plt.plot(ts, rejected, "-x", color="#d62728", label="Worst path predicted RCT")
    plt.title("Twin RCT Prediction per Decision (Case02)")
    plt.xlabel("Main sim time (decision moment)")
    plt.ylabel("Twin predicted finish_time")
    plt.grid(True, alpha=0.4); plt.legend()
    plt.tight_layout()
    plt.savefig("figures/compare/twin_predictions.png", dpi=130)
    plt.close()

# --- Plot 4: Gain distribution ---
if decisions:
    gains = [d["gain_pct"] for d in decisions]
    plt.figure(figsize=(8, 5))
    plt.hist(gains, bins=15, color="#9467bd", edgecolor="white")
    plt.title("Predicted RCT Gain per Decision")
    plt.xlabel("Gain (%) = (worst - best) / worst"); plt.ylabel("Count")
    plt.grid(True, axis="y", alpha=0.4)
    plt.tight_layout()
    plt.savefig("figures/compare/gain_histogram.png", dpi=130)
    plt.close()

print("\nAll comparison figures saved under figures/compare/")
print(f"Summary: Case02 Avg CT {a2['avg_ct']:.1f} vs Case01 {a1['avg_ct']:.1f} "
      f"({(a1['avg_ct']-a2['avg_ct'])/a1['avg_ct']*100:+.1f}% reduction)")
print(f"Summary: Case02 Throughput {a2['th']:.4f} vs Case01 {a1['th']:.4f} "
      f"({(a2['th']-a1['th'])/a1['th']*100:+.1f}% improvement)")
