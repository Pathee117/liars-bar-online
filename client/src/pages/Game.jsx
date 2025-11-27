import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import CardView from "../components/CardView.jsx";

const RANK_CYCLE = ["A", "K", "Q", "J"];
const nextRankOf = (r) => RANK_CYCLE[(RANK_CYCLE.indexOf(r) + 1) % RANK_CYCLE.length];

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [selected, setSelected] = useState([]);

  // modal + toasts
  const [roundModal, setRoundModal] = useState(null); // {result, liar, challenger, loser, loserLives, previousRank, nextRank}
  const [toasts, setToasts] = useState([]);
  const nextRankRef = useRef(null);

  const myName =
    localStorage.getItem(`liarsbar:name:${id}`) ||
    localStorage.getItem("liarsbar:name") ||
    "Player";

  useEffect(() => {
    const onGameUpdate = (g) => setGame(g);
    const onHandUpdate = (h) => setHand(h);

    socket.on("game:update", onGameUpdate);
    socket.on("hand:update", onHandUpdate);

    // NEW events
    socket.on("round:summary", (summary) => {
      const nextRank = nextRankRef.current || nextRankOf(summary.previousRank);
      setRoundModal({ ...summary, nextRank });

      // auto dismiss after 2.2s
      setTimeout(() => setRoundModal(null), 2200);
    });

    socket.on("round:nextRank", ({ rank }) => {
      nextRankRef.current = rank;
    });

    socket.on("system:log", (evt) => {
      if (evt.type === "hand:refill") {
        pushToast(`${evt.name} refilled hand (${evt.count})`);
      }
    });

    socket.emit("lobby:join", { lobbyId: id, name: myName });

    return () => {
      socket.off("game:update", onGameUpdate);
      socket.off("hand:update", onHandUpdate);
      socket.off("round:summary");
      socket.off("round:nextRank");
      socket.off("system:log");
    };
  }, [id, myName]);

  function pushToast(text) {
    const item = { id: crypto.randomUUID(), text };
    setToasts(prev => [...prev, item]);
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== item.id));
    }, 1800);
  }

  const me = useMemo(() => {
    if (!game) return null;
    const bySocket = game.players.find(p => p.socketId === socket.id);
    if (bySocket) return bySocket;
    return game.players.find(p => p.name === myName) || null;
  }, [game, myName]);

  const isSpectator = !me;

  if (!game) {
    return (
      <div className="container">
        <div className="panel" style={{ padding: 18 }}>
          <h2 className="h2">Game {id}</h2>
          <p className="muted">Waiting for game state...</p>
        </div>
      </div>
    );
  }

  if (game.state === "ended") {
    return (
      <div className="container" style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
        <div className="panel" style={{ padding: 28, textAlign: "center", width: "min(640px,100%)" }}>
          <div className="badge" style={{ marginBottom: 10 }}>Match Complete</div>
          <h1 className="h1" style={{ margin: "0 0 8px" }}>Winner</h1>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--accent)" }}>
            {game.winner}
          </div>

          <hr className="sep" />

          <button onClick={() => navigate(`/lobby/${id}`)}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const currentPlayer = game.players[game.turnIndex];
  const responder =
    game.responderIndex != null ? game.players[game.responderIndex] : null;

  const isAlive = me && me.lives > 0;

  const isMyTurn =
    isAlive &&
    currentPlayer &&
    (currentPlayer.socketId === socket.id || currentPlayer.name === myName);

  const isResponder =
    isAlive &&
    responder &&
    (responder.socketId === socket.id || responder.name === myName);

  const toggleCard = (cardId) => {
    if (!isMyTurn) return;
    setSelected(prev =>
      prev.includes(cardId) ? prev.filter(x => x !== cardId) : [...prev, cardId]
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

  const currentRank = game.tableRank;
  const predictedNextRank = nextRankRef.current || nextRankOf(currentRank);

  return (
    <div className="container" style={{ position: "relative" }}>
      {/* Round result modal */}
      {roundModal && (
        <RoundModal modal={roundModal} />
      )}

      {/* Small toast lane */}
      <div style={{ position: "fixed", top: 16, right: 16, display: "grid", gap: 8, zIndex: 50 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className="panel-soft"
            style={{
              padding: "8px 10px",
              fontWeight: 800,
              fontSize: 13,
              borderColor: "var(--border-strong)"
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Spectator banner */}
      {isSpectator && (
        <div className="panel-soft" style={{ padding: 10, marginBottom: 12, borderColor: "var(--border-strong)" }}>
          <b>Spectating</b>
          <span className="muted" style={{ marginLeft: 8 }}>
            You joined mid-game. You can watch this round and play next match.
          </span>
        </div>
      )}

      {/* Top status */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <StatusBox title="Table Rank">
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--accent)" }}>
            {currentRank}
          </div>
          <div className="muted">
            Next rank after this round: <b style={{ color: "var(--text)" }}>{predictedNextRank}</b>
          </div>
        </StatusBox>

        <StatusBox title="Current Turn">
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {currentPlayer?.name}
            {currentPlayer?.name === myName ? " (you)" : ""}
          </div>
          <div style={{ color: isMyTurn ? "var(--accent-2)" : "var(--muted)", fontWeight: 800 }}>
            {isMyTurn ? "Your turn to play" : "Waiting for play"}
          </div>
        </StatusBox>

        <StatusBox title="Last Declaration">
          {game.lastPlay ? (
            <>
              <div style={{ fontWeight: 800 }}>
                {game.lastPlay.playerName} declared {game.lastPlay.count}
              </div>
              <div className="muted">
                claiming {game.lastPlay.count} × {currentRank}
              </div>
            </>
          ) : (
            <div className="muted">No declaration yet</div>
          )}
        </StatusBox>
      </div>

      {/* Table */}
      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div>
          <h3 className="h3" style={{ margin: "6px 0" }}>Active Players</h3>

          <div className="grid">
            {game.players
              .filter(p => p.connected && p.lives > 0)
              .map(p => {
                const isTurn = p.socketId === currentPlayer?.socketId;
                const isNext = responder && p.socketId === responder.socketId;

                return (
                  <div
                    key={p.socketId}
                    className="panel-soft"
                    style={{
                      padding: "10px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderColor: isTurn ? "var(--border-strong)" : "var(--border)"
                    }}
                  >
                    <div>
                      <b>{p.name}</b>
                      {isTurn && (
                        <span className="badge" style={{ marginLeft: 8, borderColor: "var(--border-strong)" }}>
                          playing
                        </span>
                      )}
                      {isNext && !isTurn && (
                        <span className="badge" style={{ marginLeft: 8 }}>
                          responder
                        </span>
                      )}
                    </div>

                    <div className="muted" style={{ fontSize: 13 }}>
                      lives <b style={{ color: "var(--text)" }}>{p.lives}</b> · cards {p.cardsCount}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <h3 className="h3" style={{ margin: "6px 0" }}>Pile</h3>
          <PileStack count={game.pileSize ?? 0} />

          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Deck remaining: {game.deckCount}
          </div>
        </div>
      </div>

      {/* Your area */}
      <div style={{ marginTop: 16 }}>
        <h3 className="h3">Your Hand</h3>

        {!isSpectator && !isAlive && (
          <div style={{ color: "var(--danger)", fontWeight: 800, marginBottom: 8 }}>
            You are eliminated. Waiting for game end.
          </div>
        )}

        {isSpectator ? (
          <div className="muted" style={{ padding: "8px 0" }}>
            Hand hidden while spectating.
          </div>
        ) : (
          <>
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

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {isMyTurn && (
                <button onClick={playSelected}>
                  Play {selected.length} card(s)
                </button>
              )}

              {isResponder && game.lastPlay && (
                <>
                  <button className="secondary" onClick={acceptPlay}>
                    Accept
                  </button>
                  <button className="danger" onClick={challengePlay}>
                    Call Liar
                  </button>
                </>
              )}

              {!isMyTurn && !isResponder && isAlive && (
                <div className="muted" style={{ alignSelf: "center" }}>
                  Waiting for your turn...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- UI helpers ---------- */

function StatusBox({ title, children }) {
  return (
    <div className="panel" style={{ padding: "12px 14px", minHeight: 78 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function PileStack({ count }) {
  const visible = Math.min(count, 4);
  const offsets = [0, 6, 12, 18];

  return (
    <div
      className="panel-soft"
      style={{
        padding: 12,
        minHeight: 150,
        position: "relative",
        display: "grid",
        placeItems: "center"
      }}
    >
      <div style={{ position: "relative", width: 90, height: 120 }}>
        {Array.from({ length: visible }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${offsets[i]}px, ${-offsets[i]}px)`,
              borderRadius: 10,
              background:
                "repeating-linear-gradient(45deg, #0b1222 0px, #0b1222 6px, #0e1730 6px, #0e1730 12px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 8px 18px rgba(0,0,0,0.45)"
            }}
          />
        ))}
      </div>

      <div
        className="badge"
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          fontWeight: 900,
          borderColor: "var(--border-strong)"
        }}
      >
        +{count}
      </div>
    </div>
  );
}

function RoundModal({ modal }) {
  const isLiar = modal.result === "liar";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.45)",
        zIndex: 100
      }}
    >
      <div
        className="panel"
        style={{
          padding: "22px 26px",
          width: "min(540px, 92vw)",
          textAlign: "center",
          animation: "pop .18s ease-out"
        }}
      >
        <div
          style={{
            fontSize: 54,
            fontWeight: 1000,
            letterSpacing: 1,
            color: isLiar ? "var(--danger)" : "var(--accent-2)",
            textShadow: isLiar
              ? "0 0 24px rgba(239,68,68,0.45)"
              : "0 0 24px rgba(34,197,94,0.45)"
          }}
        >
          {isLiar ? "LIAR!" : "TRUTH!"}
        </div>

        <div style={{ marginTop: 8, fontWeight: 800 }}>
          {modal.challenger} challenged {modal.liar}
        </div>

        <div className="muted" style={{ marginTop: 6 }}>
          {modal.loser} loses a life • lives left: {modal.loserLives}
        </div>

        <hr className="sep" />

        <div style={{ fontWeight: 800 }}>
          Next Rank: <span style={{ color: "var(--accent)" }}>{modal.nextRank}</span>
        </div>
      </div>

      <style>{`
        @keyframes pop {
          from { transform: scale(.94); opacity: .6; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}