import { useEffect, useState } from "react";

const listeners = new Set();
let logs = [];

function notify() {
  for (const l of listeners) l(logs);
}

export function addSystemLog(text, kind = "info") {
  const entry = {
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString(),
    text,
    kind // "info" | "connected" | "disconnected"
  };
  logs = [entry, ...logs].slice(0, 200);
  notify();
}

export function clearLogs() {
  logs = [];
  notify();
}

export function useDevLogs() {
  const [state, setState] = useState(logs);

  useEffect(() => {
    listeners.add(setState);
    return () => listeners.delete(setState);
  }, []);

  return state;
}