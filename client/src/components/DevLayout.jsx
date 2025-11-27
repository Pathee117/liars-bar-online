// client/src/components/DevLayout.jsx
import LogPanel from "./LogPanel";

export default function DevLayout({ children }) {
  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1, paddingRight: 330 }}>
        {children}
      </div>
      <LogPanel />
    </div>
  );
}