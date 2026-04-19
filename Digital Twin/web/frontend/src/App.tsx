import { useEffect, useState } from "react";
import { Card, NonIdealState, Spinner, Tag } from "@blueprintjs/core";
import { api } from "./api";
import type { SimEvent, Topology } from "./types";
import { usePlayback } from "./playback/usePlayback";
import { TopBar } from "./components/TopBar";
import { ShopCanvas } from "./components/ShopCanvas";
import { DecisionPanel } from "./components/DecisionPanel";
import { KPIPanel } from "./components/KPIPanel";
import { AnalyticsTabs } from "./components/AnalyticsTabs";

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

  const pb = usePlayback(evA, evB, topology);

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
        display: "grid",
        gridTemplateRows: "auto auto auto auto auto",
        minHeight: "100vh",
        background: "#0b0d12",
        color: "#e6e8eb",
      }}
    >
      <Header />
      <TopBar pb={pb} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 360px", gap: 8, padding: 8, height: "60vh", minHeight: 420 }}>
        <Panel title="CASE 01 · ALTERNATED 基线">
          <ShopCanvas topology={topology} world={pb.worldA} label="case01" accent="#5ba8ff" />
        </Panel>
        <Panel title="CASE 02 · RCT 同步贪心">
          <ShopCanvas topology={topology} world={pb.worldB} label="case02" accent="#f39c12" />
        </Panel>
        <Panel title="孪生决策" accent="#2ecc71">
          <DecisionPanel world={pb.worldB} />
        </Panel>
      </div>

      <div style={{ padding: "0 8px 8px 8px" }}>
        <div style={{ height: 140 }}>
          <KPIPanel worldA={pb.worldA} worldB={pb.worldB} tSim={pb.tSim} />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #262c38", padding: "4px 8px 8px 8px" }}>
        <Card
          style={{
            background: "#0f1218",
            border: "1px solid #262c38",
            padding: "4px 12px",
            boxShadow: "none",
          }}
        >
          <AnalyticsTabs topology={topology} evA={evA} evB={evB} tSim={pb.tSim} />
        </Card>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "#0c0e13",
        borderBottom: "1px solid #262c38",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 2,
          background: "linear-gradient(135deg, #5ba8ff, #2ecc71)",
        }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>DIGITAL TWIN · REPLAY</div>
        <div style={{ fontSize: 10, color: "#7d8694" }}>
          基于 RCT 预测的生产路径控制 · Case01 vs Case02
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <Tag minimal>5s_determ</Tag>
      <Tag minimal intent="primary">
        SimPy 离线回放
      </Tag>
    </div>
  );
}

function Panel({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card
      style={{
        background: "#0f1218",
        border: "1px solid #262c38",
        borderTop: accent ? `2px solid ${accent}` : undefined,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          fontFamily: "ui-monospace, 'SF Mono', monospace",
          fontSize: 11,
          letterSpacing: 1,
          color: "#a6adb8",
          borderBottom: "1px solid #1c2128",
          background: "#0c0e13",
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1, padding: 10, overflow: "auto" }}>{children}</div>
    </Card>
  );
}
