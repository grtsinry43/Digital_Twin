"""
生成前端可直接消费的拓扑。

重要：dtwinpy 的 queue_id 是按 "它作为哪台机器的输入队列" 来命名的
（queue i = 机器 i 的输入队列），而不是按 arc JSON 顺序。
对应实际的 5 队列 / 5 传送带：
  Q1/conv1 : M5 → M1 （闭环）
  Q2/conv2 : M1 → M2
  Q3/conv3 : M2 → M3  （分叉慢路径）
  Q4/conv4 : M2 → M4  （分叉快路径）
  Q5/conv5 : {M3, M4} → M5   （M3/M4 共享汇合到 M5）
"""
import os, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
os.chdir(ROOT)

SRC = "models/5s_determ/initial.json"
OUT = "experiments/results/topology.json"

LAYOUT = {
    1: {"x": 200, "y": 300, "label": "M1"},
    2: {"x": 420, "y": 300, "label": "M2 · 分叉"},
    3: {"x": 660, "y": 180, "label": "M3 · 60s"},
    4: {"x": 660, "y": 420, "label": "M4 · 38s"},
    5: {"x": 880, "y": 300, "label": "M5"},
}

# 队列位置（机器入口前一点点）
QUEUE_POS = {
    1: {"x": 540, "y": 110},  # M5→M1 闭环，画在顶部
    2: {"x": 310, "y": 300},  # M1→M2
    3: {"x": 560, "y": 225},  # M2→M3
    4: {"x": 560, "y": 375},  # M2→M4
    5: {"x": 775, "y": 300},  # M3/M4→M5
}


def build():
    with open(SRC) as f:
        data = json.load(f)
    nodes = data["nodes"]
    arcs = data["arcs"]

    # arc 查找：{(from, to): contemp}
    arc_time = {tuple(a["arc"]): a["contemp"] for a in arcs}
    arc_cap = {tuple(a["arc"]): a["capacity"] for a in arcs}

    # 机器 process_time 查表
    proc_time = {n["activity"]: n["contemp"] for n in nodes}

    machines = []
    for n in nodes:
        act = n["activity"]
        pos = LAYOUT[act]
        machines.append({
            "id": act,
            "process_time": n["contemp"],
            "cluster": n["cluster"],
            "successors": n["successors"],
            "predecessors": n["predecessors"],
            "x": pos["x"], "y": pos["y"],
            "label": pos["label"],
        })

    # 按 "queue_id = 下游机器 id" 构造 queues
    # M5 的输入有两个前驱 (M3, M4)，其传送带 transp_time 以 arc [3,5] 为准
    # （dtwinpy 在构建 Conveyor(env, transp_time, queue_out) 时一个 queue_out 用一个 conv）
    queues = []
    # 对每台机器 m，找它的 predecessors，每个 pred → m 对应一条实际 arc
    for m in machines:
        mid = m["id"]
        preds = m["predecessors"]
        # 选第一个 pred 的 arc 作为该 queue 的代表 transp_time
        rep_pred = preds[0]
        transp = arc_time.get((rep_pred, mid), 0)
        cap = arc_cap.get((rep_pred, mid), 10)
        q = QUEUE_POS[mid]
        queues.append({
            "id": mid,
            "from_machines": preds,  # 可能 >1（M5 有 M3/M4 两个）
            "to_machine": mid,
            "capacity": cap,
            "transp_time": transp,
            "x": q["x"], "y": q["y"],
        })

    # 传送带：id 等于目标 queue id，可能对应多条物理线路（M3→Q5 / M4→Q5）
    # 为了可视化每条线，conveyors 里为每个 (from_machine, to) 记录一条边；id 相同
    conveyors = []
    for m in machines:
        mid = m["id"]
        for pred in m["predecessors"]:
            tt = arc_time.get((pred, mid), 0)
            conveyors.append({
                "id": mid,  # conveyor_id = target queue id
                "from_machine": pred,
                "to_queue_id": mid,
                "to_machine": mid,
                "transp_time": tt,
            })

    # 分叉点：successors 长度 > 1
    branches = [
        {"machine_id": m["id"], "out_queues": m["successors"]}
        for m in machines if len(m["successors"]) > 1
    ]

    # 初始 WIP：dtwinpy 把 initial[i] 装进 queue (i+1)
    # 实际运行显示 12 个 part 全部在 Q1（M1 的输入）—— 匹配 M5→M1 的闭环初始堆积
    # JSON 里 initial[0] 就是那 12 个 Part
    initial_by_queue = {}
    for i, parts in enumerate(data["initial"]):
        if parts:
            initial_by_queue[i + 1] = parts

    return {
        "machines": machines,
        "queues": queues,
        "conveyors": conveyors,
        "branches": branches,
        "initial_by_queue": initial_by_queue,
        "machine_proc_time": proc_time,
    }


if __name__ == "__main__":
    topo = build()
    os.makedirs("experiments/results", exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(topo, f, indent=2, ensure_ascii=False)
    print(f"Wrote {OUT}")
    print(f"  {len(topo['machines'])} machines, {len(topo['queues'])} queues, "
          f"{len(topo['conveyors'])} conveyor edges, {len(topo['branches'])} branches")
