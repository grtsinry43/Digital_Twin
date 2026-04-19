import { useEffect, useState } from "react";
import { NonIdealState, Spinner } from "@blueprintjs/core";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import type { SimEvent, Topology } from "./types";
import { NavBar } from "./components/NavBar";
import { DashboardPage } from "./pages/DashboardPage";
import { OperatorPage } from "./pages/OperatorPage";

export default function App() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [evA, setEvA] = useState<SimEvent[]>([]);
  const [evB, setEvB] = useState<SimEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.topology(), api.events("01"), api.events("02")])
      .then(([t, a, b]) => {
        setTopology(t);
        setEvA(a.events);
        setEvB(b.events);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) {
    return (
      <NonIdealState
        icon="offline"
        title="后端未就绪"
        description={err + " · 确认 uvicorn 运行在 127.0.0.1:8000"}
      />
    );
  }
  if (!topology || !evA.length || !evB.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#0b0d12",
        color: "#e6e8eb",
      }}
    >
      <NavBar />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage topology={topology} evA={evA} evB={evB} />} />
        <Route path="/operator" element={<OperatorPage topology={topology} evA={evA} evB={evB} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}
