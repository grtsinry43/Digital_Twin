import { Card } from "@blueprintjs/core";
import type { SimEvent, Topology } from "../types";
import { usePlayback } from "../playback/usePlayback";
import { TopBar } from "../components/TopBar";
import { ShopCanvas } from "../components/ShopCanvas";
import { DecisionPanel } from "../components/DecisionPanel";
import { KPIPanel } from "../components/KPIPanel";
import { AnalyticsTabs } from "../components/AnalyticsTabs";

interface Props {
  topology: Topology;
  evA: SimEvent[];
  evB: SimEvent[];
}

export function DashboardPage({ topology, evA, evB }: Props) {
  const pb = usePlayback(evA, evB, topology);

  return (
    <>
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
    </>
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
