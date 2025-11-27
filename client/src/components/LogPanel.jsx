import { useDevLogs, clearLogs } from "../devlog";

export default function LogPanel() {
  const logs = useDevLogs();

  const colorFor = (kind) => {
    if (kind === "connected") return "green";
    if (kind === "disconnected") return "red";
    return "#222";
  };

  return (
    <div
      style={{
        width: 320,
        borderLeft: "1px solid #ddd",
        padding: 12,
        fontFamily: "system-ui",
        fontSize: 12,
        height: "100vh",
        overflowY: "auto",
        background: "#fafafa",
        position: "fixed",
        right: 0,
        top: 0
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <b>System Logs</b>
        <button onClick={clearLogs} style={{ fontSize: 11 }}>Clear</button>
      </div>

      {logs.length === 0 && <div style={{ color: "#777" }}>No logs yet</div>}

      {logs.map((l) => (
        <div key={l.id} style={{ marginBottom: 8 }}>
          <div style={{ color: "#666" }}>{l.time}</div>
          <div style={{ color: colorFor(l.kind), fontWeight: 600 }}>
            {l.text}
          </div>
          <hr style={{ border: "none", borderTop: "1px solid #eee", marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}