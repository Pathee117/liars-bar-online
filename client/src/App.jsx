import { useEffect, useState } from "react";
import { socket } from "./socket";

export default function App() {
  const [status, setStatus] = useState("disconnected");
  const [pong, setPong] = useState(null);

  useEffect(() => {
    function onConnect() { setStatus("connected"); }
    function onDisconnect() { setStatus("disconnected"); }
    function onPong(data) { setPong(data); }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("pong", onPong);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("pong", onPong);
    };
  }, []);

  const sendPing = () => socket.emit("ping", "hello from client");

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Liar's Bar Online</h1>
      <p>Socket status: <b>{status}</b></p>
      <button onClick={sendPing}>Ping server</button>
      {pong && (
        <pre style={{ marginTop: 16 }}>
          {JSON.stringify(pong, null, 2)}
        </pre>
      )}
    </div>
  );
}