import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import CardView from "../components/CardView.jsx";

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [selected, setSelected] = useState([]);

  const myName =
    localStorage.getItem(`liarsbar:name:${id}`) ||
    localStorage.getItem("liarsbar:name") ||
    "Player";

  useEffect(() => {
    const onGameUpdate = (g) => setGame(g);
    const onHandUpdate = (h) => setHand(h);

    socket.on("game:update", onGameUpdate);
    socket.on("hand:update", onHandUpdate);

    // refresh-safe join (if playing, server may spectate/reconnect)
    socket.emit("lobby:join", { lobbyId: id, name: myName });

    return () => {
      socket.off("game:update", onGameUpdate);
      socket.off("hand:update", onHandUpdate);
    };
  }, [id, myName]);

  // ---- Robust identity + spectator detection ----
  const me = useMemo(() => {
    if (!game) return null;

    // Prefer socketId match (authoritative)
    const bySocket = game.players.find(p => p.socketId === socket.id);
    if (bySocket) return bySocket;

    // Fallback to name match (refresh-safe)
    return game.players.find(p => p.name === myName) || null;
  }, [game, myName]);

  const isSpectator = !me;

  if (!game) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>Game {id}</h2>
        <p>Waiting for game state...</p>
      </div>
    );
  }

  // Winner screen
  if (game.state === "ended") {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", textAlign: "center" }}>
        <h1 style={{ fontSize: 40, marginBottom: 8 }}>Game Over</h1>
        <p style={{ fontSize: 22 }}>
          Winner: <b>{game.winner}</b>
        </p>
        <button
          onClick={() => navigate(`/lobby/${id}`)}
          style={{ marginTop: 18, padding: "10px 16px", fontSize: 16 }}
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const currentPlayer = game.players[game.turnIndex];
  const responder =
    game.responderIndex != null ? game.players[game.responderIndex] : null;

  const isAlive = me && me.lives > 0;

  // My turn if either socketId or name matches current player
  const isMyTurn =
    isAlive &&
    currentPlayer &&
    (currentPlayer.socketId === socket.id ||
      currentPlayer.name === myName);

  // Responder if either socketId or name matches responder
  const isResponder =
    isAlive &&
    responder &&
    (responder.socketId === socket.id ||
      responder.name === myName);

  const toggleCard = (cardId) => {
    if (!isMyTurn) return;
    setSelected(prev =>
      prev.includes(cardId)
        ? prev.filter(x => x !== cardId)
        : [...prev, cardId]
    );
  };

  const playSelected = () => {
    if (!isMyTurn) return alert("Not your turn");
    if (selected.length < 1 || selected.length > 3)
      return alert("Select 1–3 cards");

    socket.emit(
      "turn:play",
      { lobbyId: id, cardIds: selected, declaredCount: selected.length },
      (res) => {
        if (res?.error) alert(res.error);
        else setSelected([]);
      }
    );
  };

  const acceptPlay = () => {
    socket.emit("turn:accept", { lobbyId: id }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const challengePlay = () => {
    socket.emit("turn:challenge", { lobbyId: id }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui", maxWidth: 1100 }}>
      {/* TOP STATUS BAR */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 14
        }}
      >
        <StatusBox title="Table Rank">
          <div style={{ fontSize: 26, fontWeight: 800 }}>{game.tableRank}</div>
          <div style={{ color: "#555" }}>Everyone claims {game.tableRank}</div>
        </StatusBox>

        <StatusBox title="Current Turn">
          <div style={{ fontSize: 18 }}>
            {currentPlayer?.name}
            {currentPlayer?.name === myName ? " (you)" : ""}
          </div>
          <div style={{ color: isMyTurn ? "#16a34a" : "#555", fontWeight: 700 }}>
            {isMyTurn ? "Your turn to play" : "Waiting for play"}
          </div>
        </StatusBox>

        <StatusBox title="Last Declaration">
          {game.lastPlay ? (
            <>
              <div style={{ fontWeight: 700 }}>
                {game.lastPlay.playerName} declared {game.lastPlay.count} card(s)
              </div>
              <div style={{ color: "#555" }}>
                claiming {game.lastPlay.count} × {game.tableRank}
              </div>
            </>
          ) : (
            <div style={{ color: "#777" }}>No declaration yet</div>
          )}
        </StatusBox>
      </div>

      {/* PLAYERS + PILE */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div>
          <h3 style={{ margin: "6px 0" }}>Active Players</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {game.players
              .filter(p => p.connected && p.lives > 0)
              .map(p => {
                const isTurn = p.socketId === currentPlayer?.socketId;
                const isNext = responder && p.socketId === responder.socketId;

                return (
                  <div
                    key={p.socketId}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: isTurn ? "#ecfdf5" : "white",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <b>{p.name}</b>
                      {isTurn && (
                        <span style={{ marginLeft: 6, color: "#16a34a" }}>
                          (playing)
                        </span>
                      )}
                      {isNext && !isTurn && (
                        <span style={{ marginLeft: 6, color: "#2563eb" }}>
                          (responder)
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#444" }}>
                      lives: <b>{p.lives}</b> · cards: {p.cardsCount}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <h3 style={{ margin: "6px 0" }}>Pile</h3>
          <div
            style={{
              border: "1px dashed #aaa",
              borderRadius: 10,
              padding: 12,
              minHeight: 120,
              display: "grid",
              placeItems: "center",
              color: "#555"
            }}
          >
            {game.pileSize ?? 0} card(s)
          </div>

          <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
            Deck remaining: {game.deckCount}
          </div>
        </div>
      </div>

      {/* YOUR AREA */}
      <div style={{ marginTop: 18 }}>
        <h3>Your Hand</h3>

        {isSpectator && (
          <div style={{ color: "#777", fontWeight: 700, marginBottom: 8 }}>
            You are spectating this round.
          </div>
        )}

        {!isSpectator && !isAlive && (
          <div style={{ color: "#dc2626", fontWeight: 700, marginBottom: 8 }}>
            You are eliminated. Waiting for game end.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {hand.map(c => (
            <CardView
              key={c.id}
              card={c}
              selected={selected.includes(c.id)}
              disabled={!isMyTurn}
              onClick={() => toggleCard(c.id)}
            />
          ))}
        </div>

        {/* ACTION BAR */}
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          {isMyTurn && (
            <button
              onClick={playSelected}
              style={{
                padding: "10px 14px",
                fontSize: 16,
                fontWeight: 700
              }}
            >
              Play {selected.length} card(s)
            </button>
          )}

          {isResponder && game.lastPlay && (
            <>
              <button
                onClick={acceptPlay}
                style={{ padding: "10px 14px", fontSize: 16 }}
              >
                Accept
              </button>
              <button
                onClick={challengePlay}
                style={{
                  padding: "10px 14px",
                  fontSize: 16,
                  background: "#fee2e2",
                  border: "1px solid #dc2626"
                }}
              >
                Call Liar
              </button>
            </>
          )}

          {!isMyTurn && !isResponder && isAlive && (
            <div style={{ alignSelf: "center", color: "#555" }}>
              Waiting for your turn...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBox({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: "10px 12px",
        background: "white",
        minHeight: 70
      }}
    >
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}