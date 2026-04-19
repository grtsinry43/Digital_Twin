import { Tag } from "@blueprintjs/core";
import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/dashboard", label: "看板大屏", sub: "REPLAY · 双 Case 对比" },
  { to: "/operator", label: "调度决策", sub: "WHAT-IF · 干预日志" },
];

export function NavBar() {
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
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>DIGITAL TWIN</div>
        <div style={{ fontSize: 10, color: "#7d8694" }}>基于 RCT 预测的生产路径控制</div>
      </div>

      <div style={{ width: 16 }} />

      <div style={{ display: "flex", gap: 4 }}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            style={({ isActive }) => ({
              display: "flex",
              flexDirection: "column",
              padding: "4px 14px",
              textDecoration: "none",
              borderRadius: 2,
              border: `1px solid ${isActive ? "#5ba8ff" : "#262c38"}`,
              background: isActive ? "rgba(91,168,255,0.08)" : "transparent",
              color: isActive ? "#e6e8eb" : "#a6adb8",
            })}
          >
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>{t.label}</span>
            <span style={{ fontSize: 9, color: "#7d8694" }}>{t.sub}</span>
          </NavLink>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <Tag minimal>5s_determ</Tag>
      <Tag minimal intent="primary">
        SimPy 离线回放
      </Tag>
    </div>
  );
}
