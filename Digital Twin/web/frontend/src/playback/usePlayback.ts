import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SimEvent, Topology } from "../types";
import { applyEvent, emptyWorld, type QueueToMachine, type WorldState } from "./world";

export interface PlaybackAPI {
  tSim: number;
  playing: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (t: number) => void;
  stepToNextDecision: () => void;
  stepToPrevDecision: () => void;
  worldA: WorldState; // case01
  worldB: WorldState; // case02
  tMax: number;
  decisionTimesB: number[];
}

export function usePlayback(
  eventsA: SimEvent[],
  eventsB: SimEvent[],
  topology: Topology | null,
): PlaybackAPI {
  const [tSim, setTSim] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);

  // Queue → Machine 映射（同下游 to_machine）
  const qtm: QueueToMachine = useMemo(() => {
    const m = new Map<number, number>();
    topology?.queues.forEach((q) => m.set(q.id, q.to_machine));
    return m;
  }, [topology]);

  // 世界状态 + 事件游标
  const worldARef = useRef<WorldState>(emptyWorld());
  const worldBRef = useRef<WorldState>(emptyWorld());
  const cursorA = useRef(0);
  const cursorB = useRef(0);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((x) => x + 1), []);

  // 消费事件直到 t
  const advanceTo = useCallback(
    (t: number) => {
      if (!topology) return;
      // 如果 t 往回走，重置世界
      if (t < worldARef.current.t_sim || t < worldBRef.current.t_sim) {
        worldARef.current = emptyWorld();
        worldBRef.current = emptyWorld();
        cursorA.current = 0;
        cursorB.current = 0;
      }
      while (cursorA.current < eventsA.length && eventsA[cursorA.current].t <= t) {
        applyEvent(worldARef.current, eventsA[cursorA.current], qtm);
        cursorA.current += 1;
      }
      while (cursorB.current < eventsB.length && eventsB[cursorB.current].t <= t) {
        applyEvent(worldBRef.current, eventsB[cursorB.current], qtm);
        cursorB.current += 1;
      }
      worldARef.current.t_sim = t;
      worldBRef.current.t_sim = t;
    },
    [eventsA, eventsB, qtm, topology],
  );

  // rAF 循环
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTSim((prev) => {
        const next = Math.min(prev + dt * speed, tMaxRef.current);
        advanceTo(next);
        if (next >= tMaxRef.current) setPlaying(false);
        return next;
      });
      rerender();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, advanceTo, rerender]);

  // 事件总时长
  const tMax = useMemo(() => {
    const a = eventsA.length ? eventsA[eventsA.length - 1].t : 0;
    const b = eventsB.length ? eventsB[eventsB.length - 1].t : 0;
    return Math.max(a, b);
  }, [eventsA, eventsB]);
  const tMaxRef = useRef(tMax);
  tMaxRef.current = tMax;

  const decisionTimesB = useMemo(
    () => eventsB.filter((e) => e.type === "decision_end").map((e) => e.t),
    [eventsB],
  );

  const seek = useCallback(
    (t: number) => {
      setTSim(t);
      advanceTo(t);
      rerender();
    },
    [advanceTo, rerender],
  );

  const stepToNextDecision = useCallback(() => {
    const next = decisionTimesB.find((t) => t > tSim + 0.01);
    if (next != null) seek(next);
  }, [decisionTimesB, seek, tSim]);

  const stepToPrevDecision = useCallback(() => {
    const prev = [...decisionTimesB].reverse().find((t) => t < tSim - 0.01);
    if (prev != null) seek(prev);
  }, [decisionTimesB, seek, tSim]);

  // 初始加载完成后先回到 0（触发初始事件）
  useEffect(() => {
    if (topology && eventsA.length && eventsB.length) {
      seek(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topology, eventsA, eventsB]);

  return {
    tSim,
    playing,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    togglePlay: () => setPlaying((p) => !p),
    seek,
    stepToNextDecision,
    stepToPrevDecision,
    worldA: worldARef.current,
    worldB: worldBRef.current,
    tMax,
    decisionTimesB,
  };
}
