import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { socket } from "../socket";

export default function Lobby() {
  const { id } = useParams();
  const location = useLocation();

  const initialName =
    location.state?.name ||
    localStorage.getItem(`liarsbar:name:${id}`) ||
    localStorage.getItem("liarsbar:name") ||
    "";

  const [name, setName] = useState(initialName);
  const [hasJoined, setHasJoined] = useState(Boolean(initialName));
  const [lobby, setLobby] = useState(null);

  const autoJoinRan = useRef(false);

  useEffect(() => {
    const onUpdate = (data) => setLobby(data);
    socket.on("lobby:update", onUpdate);
    return () => socket.off("lobby:update", onUpdate);
  }, []);

  useEffect(() => {
    if (!hasJoined) return;
    if (autoJoinRan.current) return;
    autoJoinRan.current = true;

    const trimmed = name.trim() || "Player";
    localStorage.setItem(`liarsbar:name:${id}`, trimmed);

    socket.emit("lobby:join", { lobbyId: id, name: trimmed }, (res) => {
      if (res?.error) alert(res.error);
    });
  }, [hasJoined, id, name]);

  useEffect(() => {
    const onGameUpdate = (game) => {
      if (game?.state === "playing") window.location.href = `/game/${id}`;
    };
    socket.on("game:update", onGameUpdate);
    return () => socket.off("game:update", onGameUpdate);
  }, [id]);

  const joinLobby = () => {
    const trimmed = name.trim() || "Player";
    localStorage.setItem(`liarsbar:name:${id}`, trimmed);

    socket.emit("lobby:join", { lobbyId: id, name: trimmed }, (res) => {
      if (res?.error) return alert(res.error);
      setHasJoined(true);
    });
  };

  const isHost = lobby && socket.id === lobby.hostSocketId;

  const startGame = () => {
    socket.emit("game:start", { lobbyId: id }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const link = `${window.location.origin}/lobby/${id}`;

  if (!hasJoined) {
    return (
      <div className="container">
        <div className="panel" style={{ padding: 20 }}>
          <h2 className="h2">Join Lobby</h2>
          <p className="muted">Lobby code: <b>{id}</b></p>

          <div className="panel-soft" style={{ padding: 14, marginTop: 10 }}>
            <label className="muted" style={{ fontSize: 13 }}>Your display name</label>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name"
                onKeyDown={(e) => e.key === "Enter" && joinLobby()}
              />
              <button onClick={joinLobby} style={{ minWidth: 120 }}>Join</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="h2" style={{ margin: 0 }}>Lobby</h2>
            <div className="muted">Code: <b>{id}</b></div>
          </div>

          {isHost && (
            <button onClick={startGame} style={{ padding: "12px 16px", fontSize: 16 }}>
              Start Game
            </button>
          )}
        </div>

        <div className="panel-soft" style={{ padding: 12, marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Invite link</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={link} />
            <button
              className="secondary"
              onClick={() => navigator.clipboard.writeText(link)}
              style={{ minWidth: 110 }}
            >
              Copy
            </button>
          </div>
        </div>

        <h3 className="h3" style={{ marginTop: 16 }}>Players</h3>

        {!lobby ? (
          <p className="muted">Loading lobby...</p>
        ) : (
          <div className="grid">
            {lobby.players
              .filter(p => p.connected)  // keep clean list
              .map((p) => (
                <div key={p.socketId} className="panel-soft" style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <b>{p.name}</b>
                    {p.socketId === lobby.hostSocketId && (
                      <span className="badge" style={{ marginLeft: 8 }}>Host</span>
                    )}
                  </div>
                  <div className="muted">connected</div>
                </div>
              ))}
          </div>
        )}

        {!isHost && (
          <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            Waiting for host to start the game…
          </div>
        )}
      </div>
    </div>
  );
}