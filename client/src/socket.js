import { io } from "socket.io-client";
import { addSystemLog } from "./devlog";

const URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
export const socket = io(URL, { autoConnect: true });

// Only lifecycle summaries
socket.on("connect", () => addSystemLog("You connected", "connected"));
socket.on("disconnect", () => addSystemLog("You disconnected", "disconnected"));

// Listen to server-side system events (main source of truth)
socket.on("system:log", (evt) => {
  switch (evt.type) {
    case "player:connected":
      addSystemLog(`${evt.name} connected`, "connected");
      break;
    case "player:disconnected":
      addSystemLog(`${evt.name} disconnected`, "disconnected");
      break;
    case "host:changed":
      addSystemLog(`${evt.newHost} is now party leader`);
      break;
    case "game:started":
      addSystemLog(`Game started by ${evt.by}`);
      break;
    default:
      addSystemLog("System event", "info");
  }
});