"""
Twin sync utilities for Case02 同步贪心.

Core idea:
- Main SimPy simulation acts as the "physical system"
- When a decision is needed, we snapshot main model's WIP state
- Rebuild a fresh twin Model from the snapshot (approximation: mid-processing
  parts and conveyor parts are placed back into their nearest input/output queue)
- Force the deciding part's branching_path in the twin, run twin until that
  part completes, compute RCT
- Repeat for each path, pick minimum RCT, write back to main's part
"""
import os, json, copy

from dtwinpylib.dtwinpy.digital_model import Model


def snapshot_wip(main_model):
    """Collect where each part is at current main env.now.
    Returns dict: {queue_id: [part_name_list_ordered]}.
    Mid-processing / on-conveyor parts are placed at their destination input queue.
    """
    # Start with empty lists for every queue
    q_by_id = {q.id: [] for q in main_model.queues_vector}
    # Track part ids already accounted for
    placed = set()

    # 1. Parts currently sitting in queues
    for q in main_model.queues_vector:
        for p in q.get_all_items():
            q_by_id[q.id].append(p.get_name())
            placed.add(p.get_id())

    # 2. Parts currently on conveyors — put them at the conveyor's destination queue
    for c in main_model.conveyors_vector:
        dest_q = c.queue_out  # Conveyor stores its destination queue
        for p in c.get_all_items():
            if p.get_id() in placed:
                continue
            q_by_id[dest_q.id].append(p.get_name())
            placed.add(p.get_id())

    # 3. Parts currently being processed in machines — put at machine's input queue
    for m in main_model.machines_vector:
        if m.part_in_machine is None:
            continue
        p = m.part_in_machine
        if p.get_id() in placed:
            continue
        # Use queue_to_get if set, else first queue_in
        target_q = m.queue_to_get if m.queue_to_get is not None else (m.queue_in[0] if m.queue_in else None)
        if target_q is not None:
            q_by_id[target_q.id].append(p.get_name())
            placed.add(p.get_id())

    return q_by_id


def write_twin_json(base_json_path, wip_by_queue_id, out_path):
    """Write a new model JSON with `initial` replaced by the snapshot.
    The queue-id to index mapping: the JSON's `arcs` array is order-preserving
    and queue indices in `initial` follow arc order. We'll match by arc order.
    """
    with open(base_json_path) as f:
        data = json.load(f)

    # initial[i] maps to queue with id == i+1 (verified via probe on 5s_determ).
    # Queue ids are 1-based and reflect model_translator's build order, not arc order.
    n_slots = len(data['initial'])
    new_initial = [wip_by_queue_id.get(i + 1, []) for i in range(n_slots)]
    data['initial'] = new_initial
    # Reset worked_time on all nodes (we approximate mid-processing as fresh)
    for node in data['nodes']:
        node['worked_time'] = 0
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)


def build_twin_model(twin_json_path, twin_db_path, targeted_part_id, until=5000):
    """Build a fresh Model from snapshot JSON."""
    m = Model(
        name=f"twin_t{targeted_part_id}",
        model_path=twin_json_path,
        database_path=twin_db_path,
        initial=True,
        until=until,
        loop_type="closed",
        targeted_part_id=targeted_part_id,
    )
    m.model_translator()
    return m


def run_twin_for_rct(twin_model, deciding_part_id, branching_path_conveyor_ids):
    """Start processes, set deciding part's branching_path, run until part finishes.
    Returns RCT = termination_time - snapshot_time (we use env.now at end as RCT proxy).
    """
    # Find deciding part in the twin
    deciding_part = None
    for q in twin_model.queues_vector:
        for p in q.get_all_items():
            if p.get_id() == deciding_part_id:
                deciding_part = p
                break
        if deciding_part:
            break

    if deciding_part is None:
        return None

    # Find conveyor objects by id
    conveyors_map = {c.id: c for c in twin_model.conveyors_vector}
    forced_path = [conveyors_map[cid] for cid in branching_path_conveyor_ids if cid in conveyors_map]
    if not forced_path:
        return None
    deciding_part.set_branching_path(forced_path)

    # Clear DB, start processes manually (same as Model.run but without env.run())
    twin_model.Database.clear(twin_model.event_table)
    twin_model.Database.initialize(twin_model.event_table)
    for mach in twin_model.machines_vector:
        twin_model.env.process(mach.run())
    for conv in twin_model.conveyors_vector:
        twin_model.env.process(conv.run())

    # Run until targeted part finishes (exit event) or until timeout
    twin_model.env.run(until=twin_model.exit)

    # Find the targeted part in terminator
    for p in twin_model.terminator.get_all_items():
        if p.get_id() == deciding_part_id:
            return p.get_termination()  # RCT proxy = twin's env.now when it finished
    # fallback: part didn't finish in twin — return last env.now as penalty
    return twin_model.env.now


def get_branch_options(main_model):
    """Return list of (branch, [list_of_conveyor_ids]) — one conveyor id per path option."""
    options = []
    for b in main_model.branches:
        convs = b.get_conveyors()
        options.append((b, [c.id for c in convs]))
    return options


def parts_at_decision_position(main_model, queue_position=2, scan_all=False):
    """Return list of parts needing a routing decision at branch input queues.
    If scan_all=True, consider every part in every branch input queue (not just position N).
    Otherwise only the part at 1-indexed queue_position.
    Parts that already have branching_path set are skipped.
    """
    found = []
    for b in main_model.branches:
        for q in b.get_branch_queue_in():
            items = q.get_all_items()
            if scan_all:
                candidates = items
            else:
                candidates = [items[queue_position - 1]] if len(items) >= queue_position else []
            for part in candidates:
                if part.get_branching_path() is None:
                    found.append((b, part))
    return found
