"""
Case02 同步贪心: main SimPy sim acts as the physical system.
At regular intervals AND when a part reaches queue_position=2 of a branch queue,
we snapshot main, build a fresh twin model, try each path, pick the one with
min predicted RCT, and write that branching_path back to main's part.
"""
import os, sys, json, time
os.environ.setdefault("MPLBACKEND", "Agg")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)
sys.path.insert(0, ROOT)

from dtwinpylib.dtwinpy.digital_model import Model
from experiments.twin_sync import (
    snapshot_wip, write_twin_json, build_twin_model,
    run_twin_for_rct, get_branch_options, parts_at_decision_position,
)
from experiments.events import EventRecorder, install_recorder

OUT_DIR = "experiments/results/case02"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs("databases/case02", exist_ok=True)
os.makedirs("databases/case02/twin", exist_ok=True)
os.makedirs("models/case02_twin", exist_ok=True)

UNTIL = 2000
DECISION_STEP = 30      # env time units between decision checks
QUEUE_POSITION = 2      # decide for the part at position 2 of branch input queue
RCT_THRESHOLD = 0.02    # only route away from "as-is" if gain > 2%
TWIN_UNTIL = 6000       # safety cap for twin sim

BASE_JSON = "models/5s_determ/initial.json"


def build_main_model(recorder=None):
    m = Model(
        name="case02_main",
        model_path=BASE_JSON,
        database_path="databases/case02/digital_database.db",
        initial=True,
        until=None,
        loop_type="closed",
    )
    m.model_translator()
    if recorder is not None:
        install_recorder(m, recorder)
    # Start processes (manual so we can step env.run ourselves)
    m.Database.clear(m.event_table)
    m.Database.initialize(m.event_table)
    for mach in m.machines_vector:
        m.env.process(mach.run())
    for conv in m.conveyors_vector:
        m.env.process(conv.run())
    return m


def evaluate_path(main_model, deciding_part_id, forced_conveyor_id, other_decisions):
    """Build a twin from main's current WIP, apply decisions, run until deciding_part finishes.
    `other_decisions`: dict {part_id: [conveyor_ids]} — already-fixed decisions carried over.
    Returns twin's env.now at part completion (RCT proxy); None if failed.
    """
    wip = snapshot_wip(main_model)
    twin_json = f"models/case02_twin/snap_{deciding_part_id}_c{forced_conveyor_id}.json"
    write_twin_json(BASE_JSON, wip, twin_json)

    twin = build_twin_model(
        twin_json_path=twin_json,
        twin_db_path=f"databases/case02/twin/twin_{deciding_part_id}_c{forced_conveyor_id}.db",
        targeted_part_id=deciding_part_id,
        until=TWIN_UNTIL,
    )

    # Apply fixed decisions from earlier (so twin's "physical" behavior matches)
    convs = {c.id: c for c in twin.conveyors_vector}
    for q in twin.queues_vector:
        for p in q.get_all_items():
            if p.get_id() in other_decisions:
                path_ids = other_decisions[p.get_id()]
                p.set_branching_path([convs[cid] for cid in path_ids if cid in convs])

    # Force the deciding part's path
    rct = run_twin_for_rct(twin, deciding_part_id, [forced_conveyor_id])
    return rct


def run_case02():
    recorder = EventRecorder()
    main = build_main_model(recorder=recorder)
    decisions = {}          # part_id -> [conveyor_ids] chosen
    decision_log = []       # list of {t, part_id, rct_per_path, chosen, gain}
    branch_options = get_branch_options(main)
    all_conveyor_ids_by_branch = {b.id: conv_ids for b, conv_ids in branch_options}

    t = 0
    while t < UNTIL:
        t += DECISION_STEP
        if t > UNTIL:
            t = UNTIL
        main.env.run(until=t)

        # At each step, look for parts that need a decision — scan every part in branch queues
        to_decide = parts_at_decision_position(main, queue_position=QUEUE_POSITION, scan_all=True)
        for branch, part in to_decide:
            pid = part.get_id()
            if pid in decisions:
                continue  # already decided

            conv_ids = all_conveyor_ids_by_branch[branch.id]
            print(f"\n[t={main.env.now}] Deciding for Part {pid} at {branch.get_name()} → options {conv_ids}")
            recorder.emit({
                "t": float(main.env.now),
                "type": "decision_start",
                "part_id": pid,
                "branch_id": branch.id,
                "options": list(conv_ids),
            })

            rcts = {}
            for cid in conv_ids:
                rct = evaluate_path(main, pid, cid, decisions)
                rcts[cid] = rct
                print(f"    conveyor {cid} → predicted finish_time={rct}")

            # Choose min; compute gain vs "first option" as baseline
            valid = {c: r for c, r in rcts.items() if r is not None}
            if not valid:
                continue
            best_cid = min(valid, key=valid.get)
            best_rct = valid[best_cid]
            baseline = max(valid.values())
            gain = (baseline - best_rct) / baseline if baseline else 0

            if gain >= RCT_THRESHOLD:
                decisions[pid] = [best_cid]
                # Apply back to main's part object
                main_convs = {c.id: c for c in main.conveyors_vector}
                part.set_branching_path([main_convs[best_cid]])
                print(f"    ✓ CHOSEN conveyor {best_cid} (gain {gain*100:.1f}%)")
                decision_log.append({
                    "t": main.env.now,
                    "part_id": pid,
                    "rcts": rcts,
                    "chosen_conveyor_id": best_cid,
                    "gain_pct": gain * 100,
                })
                recorder.emit({
                    "t": float(main.env.now),
                    "type": "decision_end",
                    "part_id": pid,
                    "branch_id": branch.id,
                    "rcts": {str(k): v for k, v in rcts.items()},
                    "chosen_conveyor_id": best_cid,
                    "gain_pct": gain * 100,
                    "applied": True,
                })
            else:
                print(f"    — gain {gain*100:.1f}% < threshold, keeping alternated default")
                recorder.emit({
                    "t": float(main.env.now),
                    "type": "decision_end",
                    "part_id": pid,
                    "branch_id": branch.id,
                    "rcts": {str(k): v for k, v in rcts.items()},
                    "chosen_conveyor_id": best_cid,
                    "gain_pct": gain * 100,
                    "applied": False,
                })

    # Collect results
    parts = sorted(main.terminator.get_all_items(), key=lambda p: p.get_id())
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
    with open(f"{OUT_DIR}/decisions.json", "w") as f:
        json.dump(decision_log, f, indent=2)
    recorder.dump(f"{OUT_DIR}/events.json", meta={
        "case": "case02",
        "until": UNTIL,
        "decision_step": DECISION_STEP,
        "rct_threshold": RCT_THRESHOLD,
        "model_path": BASE_JSON,
    })

    if records:
        avg_ct = sum(r["cycle_time"] for r in records) / len(records)
        th = len(records) / records[-1]["termination"]
        print(f"\n=== Case02 Results ===")
        print(f"Parts finished: {len(records)}")
        print(f"Avg CT: {avg_ct:.2f}  Min: {min(r['cycle_time'] for r in records)}  Max: {max(r['cycle_time'] for r in records)}")
        print(f"Throughput: {th:.4f}")
        print(f"Decisions made: {len(decision_log)}")


if __name__ == "__main__":
    run_case02()
