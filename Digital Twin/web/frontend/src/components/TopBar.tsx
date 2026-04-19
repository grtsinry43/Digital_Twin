import { Button, ButtonGroup, Slider, Tag, Divider } from "@blueprintjs/core";
import type { PlaybackAPI } from "../playback/usePlayback";

const SPEED_PRESETS = [1, 5, 10, 20, 50, 100];

export function TopBar({ pb }: { pb: PlaybackAPI }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        background: "#12151c",
        borderBottom: "1px solid #262c38",
        fontFamily: "ui-monospace, 'SF Mono', monospace",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: pb.playing ? "#2ecc71" : "#f39c12",
            boxShadow: pb.playing ? "0 0 8px #2ecc71" : undefined,
          }}
        />
        <span style={{ color: "#a6adb8", fontSize: 12, letterSpacing: 1 }}>
          {pb.playing ? "PLAYING" : "PAUSED"}
        </span>
      </div>

      <Divider />

      <ButtonGroup>
        <Button
          icon={pb.playing ? "pause" : "play"}
          intent={pb.playing ? "warning" : "success"}
          onClick={pb.togglePlay}
          text={pb.playing ? "暂停" : "播放"}
        />
        <Button icon="reset" onClick={() => pb.seek(0)} text="复位" />
        <Button icon="step-backward" onClick={pb.stepToPrevDecision} text="上个决策" />
        <Button icon="step-forward" onClick={pb.stepToNextDecision} text="下个决策" intent="primary" />
      </ButtonGroup>

      <Divider />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#a6adb8", fontSize: 12 }}>倍速</span>
        <ButtonGroup>
          {SPEED_PRESETS.map((s) => (
            <Button
              key={s}
              small
              active={pb.speed === s}
              onClick={() => pb.setSpeed(s)}
              text={`${s}×`}
            />
          ))}
        </ButtonGroup>
      </div>

      <Divider />

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 280 }}>
        <Tag minimal intent="none" style={{ fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "center" }}>
          t = {pb.tSim.toFixed(0).padStart(4, " ")} / {pb.tMax.toFixed(0)}
        </Tag>
        <Slider
          min={0}
          max={Math.max(pb.tMax, 1)}
          value={Math.min(pb.tSim, pb.tMax)}
          onChange={(v) => pb.seek(v)}
          labelRenderer={false}
          stepSize={1}
        />
      </div>
    </div>
  );
}
