import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { socket } from "../socket";
import { VERSION } from "../version";

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
  const players = lobby?.players?.filter((p) => p.connected) || [];
  const meName =
    localStorage.getItem(`liarsbar:name:${id}`) ||
    localStorage.getItem("liarsbar:name") ||
    "Player";

  if (!hasJoined) {
    return (
      <div className="container lobby-wrap">
        <div className="panel lobby-panel">
          <div className="lobby-hero">
            <div className="lobby-hero-left">
              <div className="badge">Lobby Code</div>
              <div className="lobby-code">{id}</div>
              <div className="muted lobby-sub">
                Join with your name to take a seat at the table.
              </div>
            </div>
            <div className="lobby-hero-right">
              <div className="panel-soft join-card">
                <label className="muted" style={{ fontSize: 13 }}>
                  Your display name
                </label>
                <div className="join-row">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter name"
                    onKeyDown={(e) => e.key === "Enter" && joinLobby()}
                  />
                  <button onClick={joinLobby} style={{ minWidth: 120 }}>
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="version-badge">v{VERSION}</div>

        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="container lobby-wrap">
      <div className="panel lobby-panel">
        {/* Top header row */}
        <div className="lobby-header">
          <div>
            <h2 className="h2" style={{ margin: 0 }}>
              Lobby
            </h2>
            <div className="muted" style={{ marginTop: 2 }}>
              Code: <b className="lobby-code-inline">{id}</b>
            </div>
          </div>

          <div className="header-actions">
            <div className="seat-pill">
              Players <b>{players.length}</b>/8
            </div>
            {isHost && (
              <button
                onClick={startGame}
                className="start-btn"
                style={{ padding: "10px 14px", fontSize: 15 }}
              >
                Start Game
              </button>
            )}
          </div>
        </div>

        {/* Content grid */}
        <div className="lobby-grid">
          {/* Players column */}
          <section className="players-col">
            <div className="players-head">
              <h3 className="h3" style={{ margin: 0 }}>
                Players
              </h3>
              <div className="muted" style={{ fontSize: 12 }}>
                {isHost
                  ? "You’re hosting. Start when ready."
                  : "Waiting for host to start…"}
              </div>
            </div>

            {!lobby ? (
              <p className="muted">Loading lobby...</p>
            ) : (
              <div className="players-grid">
                {players.map((p) => {
                  const host = p.socketId === lobby.hostSocketId;
                  const me =
                    p.socketId === socket.id || p.name === meName;

                  return (
                    <div
                      key={p.socketId}
                      className={`player-chip ${host ? "host" : ""} ${
                        me ? "me" : ""
                      }`}
                    >
                      <div className="chip-left">
                        <div className="avatar">
                          {p.name?.[0]?.toUpperCase() || "P"}
                        </div>
                        <div className="chip-text">
                          <div className="chip-name">
                            {p.name}
                            {me && (
                              <span className="badge tiny" style={{ marginLeft: 6 }}>
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="muted" style={{ fontSize: 11 }}>
                            connected
                          </div>
                        </div>
                      </div>

                      {host && (
                        <span className="badge tiny host-badge">Host</span>
                      )}
                    </div>
                  );
                })}

                {/* subtle empty seats */}
                {Array.from({ length: Math.max(0, 8 - players.length) }).map(
                  (_, i) => (
                    <div key={`empty-${i}`} className="player-chip empty">
                      <div className="empty-dot" />
                      <div className="muted" style={{ fontSize: 12 }}>
                        Empty seat
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* Side column */}
          <aside className="side-col">
            <div className="panel-soft side-card">
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Invite link
              </div>
              <div className="invite-row">
                <input readOnly value={link} />
                <button
                  className="secondary"
                  onClick={() => navigator.clipboard.writeText(link)}
                  style={{ minWidth: 92 }}
                >
                  Copy
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Share code: <b>{id}</b>
              </div>
            </div>

            <div className="panel-soft side-card">
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Quick rules
              </div>
              <ul className="muted rules-list">
                <li>Chooser sets rank each round.</li>
                <li>Play 1–3 cards face down.</li>
                <li>Responder accepts or calls liar.</li>
                <li>First penalty: spin then fire.</li>
                <li>Second penalty: fire only.</li>
                <li>Empty hand = safe this round.</li>
              </ul>
            </div>
          </aside>
        </div>

        {!isHost && (
          <div className="muted wait-note">
            Waiting for host to start the game…
          </div>
        )}
      </div>

      {/* Version badge bottom-right */}
      <div className="version-badge">v{VERSION}</div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .lobby-wrap {
    min-height: 100%;
    position: relative;
  }
  .lobby-panel{
    padding: clamp(14px, 2.2vw, 20px);
    position: relative;
    overflow: hidden;
  }

  /* subtle ambient inside panel only */
  .lobby-panel::before{
    content:"";
    position:absolute;
    inset:-40%;
    background:
      radial-gradient(700px 380px at 0% 0%, rgba(124,58,237,0.18), transparent 60%),
      radial-gradient(600px 340px at 100% 10%, rgba(34,197,94,0.16), transparent 60%);
    filter: blur(30px);
    z-index:0;
  }
  .lobby-panel > * { position: relative; z-index: 1; }

  .lobby-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding-bottom: 10px;
    border-bottom:1px solid rgba(255,255,255,0.06);
    margin-bottom: 12px;
  }
  .lobby-code-inline{
    color: var(--accent);
    letter-spacing: .5px;
  }
  .header-actions{
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:wrap;
  }
  .seat-pill{
    font-size:12px;
    font-weight:900;
    padding:6px 10px;
    border-radius:999px;
    background: rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.08);
  }
  .start-btn{
    border-radius:12px;
    font-weight:900;
    background: linear-gradient(90deg, rgba(124,58,237,0.85), rgba(34,211,238,0.9));
    box-shadow: 0 8px 22px rgba(0,0,0,0.45);
  }

  .lobby-grid{
    display:grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 12px;
    margin-top: 10px;
  }

  .players-head{
    display:flex;
    align-items:baseline;
    justify-content:space-between;
    gap:8px;
    margin-bottom:8px;
  }

  /* compact, nice chips */
  .players-grid{
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
    gap:8px;
  }
  .player-chip{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:8px;
    padding:8px 10px;
    border-radius:12px;
    background: rgba(17,24,39,0.9);
    border:1px solid rgba(255,255,255,0.08);
    box-shadow: 0 6px 14px rgba(0,0,0,0.35);
  }
  .player-chip.host{
    border-color: rgba(124,58,237,0.6);
    background: rgba(124,58,237,0.12);
  }
  .player-chip.me{
    border-color: rgba(34,197,94,0.6);
    background: rgba(34,197,94,0.12);
  }
  .chip-left{
    display:flex;
    align-items:center;
    gap:8px;
    min-width:0;
  }
  .avatar{
    width:30px;height:30px;border-radius:999px;
    display:grid;place-items:center;
    font-weight:1000;font-size:13px;
    background: rgba(255,255,255,0.08);
    border:1px solid rgba(255,255,255,0.12);
    flex:0 0 auto;
  }
  .chip-text{ min-width:0; }
  .chip-name{
    font-size:13px;
    font-weight:900;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    max-width: 120px;
  }
  .badge.tiny{
    font-size:9px;
    padding:2px 6px;
  }
  .host-badge{
    background: rgba(124,58,237,0.25);
  }

  .player-chip.empty{
    opacity: .55;
    border-style: dashed;
    justify-content:flex-start;
  }
  .empty-dot{
    width:8px;height:8px;border-radius:999px;
    background: rgba(255,255,255,0.4);
    box-shadow: 0 0 10px rgba(255,255,255,0.5);
  }

  .side-col{
    display:grid;
    gap:10px;
    align-content:start;
  }
  .side-card{
    padding:12px;
    display:grid;
    gap:8px;
  }
  .invite-row{
    display:grid;
    grid-template-columns: 1fr auto;
    gap:8px;
  }
  .rules-list{
    margin:0;
    padding-left:16px;
    display:grid;
    gap:4px;
    font-size:13px;
    line-height:1.5;
  }
  .wait-note{
    margin-top: 10px;
    font-size: 13px;
    text-align: center;
    opacity: .9;
  }

  /* Join hero (compact) */
  .lobby-hero{
    display:grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap:12px;
    align-items:center;
  }
  .lobby-code{
    font-size: clamp(26px, 3.2vw, 34px);
    font-weight:1000;
    color: var(--accent);
    letter-spacing:1px;
    margin-top:6px;
  }
  .lobby-sub{ font-size: 14px; margin-top: 6px; }
  .join-card{ padding:12px; }
  .join-row{
    display:grid;
    grid-template-columns: 1fr auto;
    gap:8px;
    margin-top:6px;
  }

  /* Responsive */
  @media (max-width: 900px){
    .lobby-grid{ grid-template-columns: 1fr; }
    .lobby-hero{ grid-template-columns: 1fr; }
  }
  @media (max-width: 520px){
    .players-grid{
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
    .invite-row, .join-row{
      grid-template-columns: 1fr;
    }
  }

  .version-badge{
    position: fixed;
    bottom: 10px;
    right: 12px;
    font-size: 11px;
    opacity: 0.6;
    font-weight: 800;
    letter-spacing: 0.5px;
    z-index: 999;
    pointer-events: none;
  }
`;