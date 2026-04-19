import type { EventsPayload, KPI, Topology } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function j<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  topology: () => j<Topology>("/api/topology"),
  events: (c: "01" | "02") => j<EventsPayload>(`/api/events?case=${c}`),
  kpi: () => j<Record<string, KPI>>("/api/kpi"),
};
