import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");

  useEffect(() => {
    // Optional: clear global cached name so user picks fresh each session
    // localStorage.removeItem("liarsbar:name");
  }, []);

  const createLobby = () => {
    const trimmed = name.trim() || "Player";
    localStorage.setItem("liarsbar:name", trimmed);

    socket.emit("lobby:create", { name: trimmed }, (res) => {
      if (res?.lobbyId) {
        navigate(`/lobby/${res.lobbyId}`, { state: { name: trimmed } });
      }
    });
  };

  return (
    <div className="container" style={{ minHeight: "100%", display: "grid", placeItems: "center" }}>
      <div className="panel" style={{ padding: 28, width: "min(720px, 100%)" }}>
        <div className="grid" style={{ gap: 18 }}>
          <div>
            <div className="badge">Online Multiplayer</div>
            <h1 className="h1" style={{ margin: "8px 0 4px" }}>Liar’s Bar</h1>
            <p className="muted" style={{ margin: 0 }}>
              Bluff, challenge, survive. Create a lobby and invite 2–8 friends.
            </p>
          </div>

          <div className="panel-soft" style={{ padding: 14 }}>
            <label className="muted" style={{ fontSize: 13 }}>Your display name</label>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tharindu"
                onKeyDown={(e) => e.key === "Enter" && createLobby()}
              />
              <button onClick={createLobby} style={{ minWidth: 140 }}>
                Create Lobby
              </button>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 13 }}>
            Tip: once in the lobby, share the link to invite players.
          </div>
        </div>
      </div>
    </div>
  );
}