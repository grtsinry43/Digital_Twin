import { useMemo } from "react";
import { Tab, Tabs } from "@blueprintjs/core";
import type { SimEvent, Topology } from "../types";
import { derive } from "../analytics";
import { UtilizationChart } from "./analytics/UtilizationChart";
import { QueueLengthChart } from "./analytics/QueueLengthChart";
import { PathTimeChart } from "./analytics/PathTimeChart";
import { PredictionChart } from "./analytics/PredictionChart";
import { MqttLog } from "./MqttLog";

interface Props {
  topology: Topology;
  evA: SimEvent[];
  evB: SimEvent[];
  tSim: number;
}

export function AnalyticsTabs({ topology, evA, evB, tSim }: Props) {
  const a = useMemo(() => derive(evA, topology), [evA, topology]);
  const b = useMemo(() => derive(evB, topology), [evB, topology]);
  const queueIds = topology.queues.map((q) => q.id);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Tabs id="analytics" defaultSelectedTabId="util" renderActiveTabPanelOnly={true} large={false}>
        <Tab id="util" title="机器利用率" panel={<Pane><UtilizationChart a={a} b={b} /></Pane>} />
        <Tab id="qlen" title="队列长度" panel={<Pane><QueueLengthChart a={a} b={b} queueIds={queueIds} /></Pane>} />
        <Tab id="path" title="路径耗时" panel={<Pane><PathTimeChart a={a} b={b} /></Pane>} />
        <Tab id="pred" title="预测 vs 实际" panel={<Pane><PredictionChart b={b} /></Pane>} />
        <Tab id="log" title="MQTT 决策流" panel={<Pane><MqttLog eventsB={evB} tSim={tSim} /></Pane>} />
      </Tabs>
    </div>
  );
}

function Pane({ children }: { children: React.ReactNode }) {
  return <div style={{ width: "100%", height: 320, padding: "8px 4px 4px 4px" }}>{children}</div>;
}
