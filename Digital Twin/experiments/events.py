"""
事件采集器 · 非侵入式

在 model_translator() 之后、env.run() 之前调用 install_recorder(model, rec)，
它会 monkey-patch 该 model 里每个 Queue / Conveyor / Terminator 实例，
把关键动作转成结构化事件塞进 recorder。不改动 dtwinpylib 源码。

事件 schema 见 docs/coursework/events-schema.md。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List


class EventRecorder:
    def __init__(self):
        self.events: List[Dict[str, Any]] = []

    def emit(self, ev: Dict[str, Any]) -> None:
        self.events.append(ev)

    def dump(self, path: str, meta: Dict[str, Any] | None = None) -> None:
        payload = {"meta": meta or {}, "events": self.events}
        with open(path, "w") as f:
            json.dump(payload, f, indent=2, default=_json_default)


def _json_default(o):
    # numpy scalar 等也能落地
    if hasattr(o, "item"):
        return o.item()
    return str(o)


def install_recorder(model, recorder: EventRecorder) -> None:
    """给一个已经 model_translator() 过的 Model 装上事件钩子。"""
    env = model.env

    # --- 1. Part 初始位置 → part_create + queue_enter(初始队列)
    for q in model.queues_vector:
        for part in q.get_all_items():
            recorder.emit({
                "t": float(env.now),
                "type": "part_create",
                "part_id": part.get_id(),
                "queue_id": q.get_id(),
            })
            recorder.emit({
                "t": float(env.now),
                "type": "queue_enter",
                "queue_id": q.get_id(),
                "part_id": part.get_id(),
                "source": "init",
            })

    # --- 2. Queue.put / Queue.get 挂钩
    for q in model.queues_vector:
        _patch_queue(q, recorder, env)

    # --- 3. Conveyor.start_transp 挂钩 + 替换 run
    for conv in model.conveyors_vector:
        _patch_conveyor(conv, recorder, env)

    # --- 4. Terminator.terminate_part 挂钩
    _patch_terminator(model.terminator, recorder, env)


def _patch_queue(queue, recorder: EventRecorder, env):
    orig_put = queue.put
    orig_get = queue.get
    qid = queue.get_id()

    def patched_put(part):
        recorder.emit({
            "t": float(env.now),
            "type": "queue_enter",
            "queue_id": qid,
            "part_id": part.get_id(),
        })
        return orig_put(part)

    def patched_get():
        evt = orig_get()

        def on_resolve(event):
            part = event.value
            if part is None:
                return
            recorder.emit({
                "t": float(env.now),
                "type": "queue_exit",
                "queue_id": qid,
                "part_id": part.get_id(),
            })

        evt.callbacks.append(on_resolve)
        return evt

    queue.put = patched_put
    queue.get = patched_get


def _patch_conveyor(conv, recorder: EventRecorder, env):
    orig_start = conv.start_transp
    cid = conv.id
    to_qid = conv.queue_out.get_id()

    def patched_start(part):
        recorder.emit({
            "t": float(env.now),
            "type": "conveyor_enter",
            "conveyor_id": cid,
            "part_id": part.get_id(),
            "to_queue_id": to_qid,
            "transp_time": conv.transp_time,
        })
        return orig_start(part)

    conv.start_transp = patched_start

    # 替换 run —— 在 queue_out.put 之前发 conveyor_exit
    def patched_run():
        while True:
            parts_in_conveyor = conv.get_all_items()
            if len(parts_in_conveyor) > 0:
                first_part = parts_in_conveyor[0]
                started = first_part.get_convey_entering_time()
                if env.now - started >= conv.transp_time:
                    conv.finish_transp()
                    recorder.emit({
                        "t": float(env.now),
                        "type": "conveyor_exit",
                        "conveyor_id": cid,
                        "part_id": first_part.get_id(),
                        "to_queue_id": to_qid,
                    })
                    conv.queue_out.put(first_part)
            yield env.timeout(conv.wait)

    conv.run = patched_run


def _patch_terminator(term, recorder: EventRecorder, env):
    orig = term.terminate_part

    def patched(part):
        recorder.emit({
            "t": float(env.now),
            "type": "terminate",
            "part_id": part.get_id(),
            "creation_time": part.get_creation(),
            "cycle_time": float(env.now) - float(part.get_creation()),
        })
        return orig(part)

    term.terminate_part = patched
