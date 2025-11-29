import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import CardView from "../components/CardView.jsx";
import RevolverModal from "../components/RevolverModal.jsx";
import { VERSION } from "../version";

const RANKS = ["A", "K", "Q", "J"];

export default function Game() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [hand, setHand] = useState([]);
  const [selected, setSelected] = useState([]);

  const [roundModal, setRoundModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const dismissTimerRef = useRef(null);

  // --- Gun modal state ---
  const [gunPending, setGunPending] = useState(null);
  const [gunResult, setGunResult] = useState(null);
  // shape: { pendingGunFor, loserName }

  const myName =
    localStorage.getItem(`liarsbar:name:${id}`) ||
    localStorage.getItem("liarsbar:name") ||
    "Player";

  // desktop detection
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 900px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const onGameUpdate = (g) => setGame(g);
    const onHandUpdate = (h) => setHand(h);

    socket.on("game:update", onGameUpdate);
    socket.on("hand:update", onHandUpdate);

    socket.on("round:summary", (summary) => {
      setRoundModal(summary);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setRoundModal(null);
      }, 2200);
    });

    socket.on("system:log", (evt) => {
      if (evt.type === "round:rankChosen") {
        pushToast(`${evt.by} chose rank ${evt.rank}`);
      }
      if (evt.type === "player:died") {
        pushToast(`${evt.name} died.`);
      }
      if (evt.type === "player:survived") {
        pushToast(`${evt.name} survived.`);
      }
      if (evt.type === "round:playerOut") {
        pushToast(`${evt.name} emptied their hand. Safe this round.`);
      }
    });

    // --- gun events ---
    const onGunPending = (data) => {
      setGunPending(data);
      setGunResult(null);
    };
    const onGunResult = (data) => {
      // show tiny toast + close modal after a beat
      pushToast(
        data.died
          ? `${data.loserName} died.`
          : `${data.loserName} survived.`
      );
      setGunResult({ died: data.died });
      setTimeout(() => setGunPending(null), 700);
    };

    socket.on("gun:pending", onGunPending);
    socket.on("gun:result", onGunResult);

    socket.emit("lobby:join", { lobbyId: id, name: myName });

    return () => {
      socket.off("game:update", onGameUpdate);
      socket.off("hand:update", onHandUpdate);
      socket.off("round:summary");
      socket.off("system:log");
      socket.off("gun:pending", onGunPending);
      socket.off("gun:result", onGunResult);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [id, myName]);

  function pushToast(text) {
    const item = { id: crypto.randomUUID(), text };
    setToasts((prev) => [...prev, item]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== item.id));
    }, 1800);
  }

  // ---------- identity (alive-model safe) ----------
  const me = useMemo(() => {
    if (!game) return null;

    if (socket.id) {
      const bySocket = game.players.find((p) => p.socketId === socket.id);
      if (bySocket) return bySocket;
    }

    const sameName = game.players.filter((p) => p.name === myName);
    if (sameName.length === 0) return null;

    const connectedAlive = sameName.find((p) => p.connected && p.alive);
    if (connectedAlive) return connectedAlive;

    const connectedAny = sameName.find((p) => p.connected);
    if (connectedAny) return connectedAny;

    return sameName[0];
  }, [game, myName]);

  const isSpectator = !me || !me.alive;
  const isAlive = me && me.alive;
  // ------------------------------------------------

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
      <div
        className="container"
        style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}
      >
        <div
          className="panel"
          style={{
            padding: 28,
            textAlign: "center",
            width: "min(640px,100%)",
          }}
        >
          <div className="badge" style={{ marginBottom: 10 }}>
            Match Complete
          </div>
          <h1 className="h1" style={{ margin: "0 0 8px" }}>
            Winner
          </h1>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: "var(--accent)",
            }}
          >
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

  const isMyTurn =
    isAlive &&
    currentPlayer &&
    (currentPlayer.socketId === socket.id || currentPlayer.name === myName);

  const isResponder =
    isAlive &&
    responder &&
    (responder.socketId === socket.id || responder.name === myName);

  const isChoosingRank = game.phase === "chooseRank";
  const canChooseRank = isChoosingRank && isMyTurn && !isSpectator;

  const chooseRank = (rank) => {
    if (!canChooseRank) return;
    socket.emit("round:chooseRank", { lobbyId: id, rank }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const toggleCard = (cardId) => {
    if (!isMyTurn || isChoosingRank) return;
    setSelected((prev) =>
      prev.includes(cardId)
        ? prev.filter((x) => x !== cardId)
        : [...prev, cardId]
    );
  };

  const playSelected = () => {
    if (isChoosingRank) return alert("Choose the table rank first.");
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

  const fireGun = () => {
    if (!gunPending) return;
    socket.emit("gun:fire", { lobbyId: id }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  const spinGun = () => {
    if (!gunPending) return;
    socket.emit("gun:spin", { lobbyId: id }, (res) => {
      if (res?.error) alert(res.error);
    });
  };

  return (
    <div
      className="container"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
      }}
    >
      {/* Gun modal */}
      <RevolverModal
        open={!!gunPending}
        isMePending={gunPending?.pendingGunFor === socket.id}
        pendingName={gunPending?.loserName}
        canSpin={gunPending?.canSpin ?? true}
        onSpin={spinGun}
        onFire={fireGun}
        gunResult={gunResult}
      />

      {roundModal && <RoundModal modal={roundModal} />}

      {/* Toast lane */}
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          display: "grid",
          gap: 8,
          zIndex: 50,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="panel-soft"
            style={{ padding: "6px 8px", fontWeight: 800, fontSize: 12 }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {isSpectator && (
        <div className="panel-soft" style={{ padding: 8 }}>
          <b>{me?.alive === false ? "You are dead" : "Spectating"}</b>
          <span className="muted" style={{ marginLeft: 8 }}>
            {me?.alive === false
              ? "You can watch until the match ends."
              : "You joined mid-game. You can watch this match."}
          </span>
        </div>
      )}

      {/* -------- TOP AREA: table + optional right rank panel -------- */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: isDesktop ? "1fr 220px" : "1fr",
          gap: 10,
          minHeight: 0,
        }}
      >
        <TableView
          players={game.players}
          me={me}
          currentPlayer={currentPlayer}
          responder={responder}
          tableRank={game.tableRank}
          showCenterRank={!isDesktop}
        />

        {isDesktop && <RankPanel rank={game.tableRank} />}
      </div>

      {/* -------- BOTTOM AREA: choose rank OR hand -------- */}
      <div
        className="panel"
        style={{
          padding: 10,
          borderColor: "var(--border-strong)",
          flexShrink: 0,
        }}
      >
        {isChoosingRank ? (
          <>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>
              Choose table rank
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {canChooseRank
                ? "Pick the rank everyone must claim."
                : `Waiting for ${currentPlayer?.name}...`}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {RANKS.map((r) => (
                <button
                  key={r}
                  onClick={() => chooseRank(r)}
                  disabled={!canChooseRank}
                  style={{ minWidth: 56 }}
                >
                  {r}
                </button>
              ))}
            </div>
          </>
        ) : isSpectator ? (
          <div className="muted">Hand hidden while spectating.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {hand.map((c) => (
                <CardView
                  key={c.id}
                  card={c}
                  selected={selected.includes(c.id)}
                  disabled={!isMyTurn}
                  onClick={() => toggleCard(c.id)}
                />
              ))}
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
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

      {/* Version badge bottom-right */}
      <div
        style={{
          position: "fixed",
          bottom: 10,
          right: 12,
          fontSize: 11,
          opacity: 0.6,
          fontWeight: 800,
          letterSpacing: 0.5,
          zIndex: 999,
          pointerEvents: "none",
        }}
      >
        v{VERSION}
      </div>
    </div>
  );
}

/* ---------------- Desktop rank panel ---------------- */

function RankPanel({ rank }) {
  return (
    <div className="panel" style={{ padding: 14, height: "fit-content" }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
        Rank
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 1000,
          color: "var(--accent)",
          textAlign: "center",
          marginTop: 6,
        }}
      >
        {rank ?? "—"}
      </div>
      <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        Table claim
      </div>
    </div>
  );
}

/* ---------------- TABLE VIEW ---------------- */

function TableView({
  players,
  me,
  currentPlayer,
  responder,
  tableRank,
  showCenterRank,
}) {
  const mySeatIndex = me
    ? players.findIndex((p) => p.socketId === me.socketId)
    : 0;

  const ordered = rotatePlayers(players, mySeatIndex);
  const seats = makeSeatCoords(ordered.length);

  return (
    <div
      className="panel"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg
        viewBox="0 0 900 1600"
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          inset: "8% 16%",
          width: "68%",
          height: "84%",
          filter: "drop-shadow(0 14px 28px rgba(0,0,0,0.55))",
        }}
      >
        <ellipse cx="450" cy="800" rx="280" ry="460" fill="#0b8f3b" />
        <ellipse
          cx="450"
          cy="800"
          rx="298"
          ry="478"
          fill="none"
          stroke="#055626"
          strokeWidth="26"
        />
      </svg>

      {showCenterRank && (
        <div
          className="panel-soft"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            padding: "10px 12px",
            textAlign: "center",
            minWidth: 140,
            borderColor: "var(--border-strong)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>
            Rank
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 1000,
              color: "var(--accent)",
            }}
          >
            {tableRank ?? "—"}
          </div>
        </div>
      )}

      {ordered.map((p, idx) => {
        const seat = seats[idx];
        const isTurn = p.socketId === currentPlayer?.socketId;
        const isNext = responder && p.socketId === responder.socketId;
        const isMe = me && p.socketId === me.socketId;

        const dead = !p.alive || !p.connected;

        const baseBorder = "1px solid rgba(255,255,255,0.12)";
        const responderBorder = "2px solid rgba(59,130,246,0.9)";
        const currentBorder = "3px solid var(--accent)";
        const currentGlow = "0 0 18px rgba(34,211,238,0.75)";
        const responderGlow = "0 0 12px rgba(59,130,246,0.5)";

        return (
          <div
            key={p.socketId}
            style={{
              position: "absolute",
              left: `${seat.x}%`,
              top: `${seat.y}%`,
              transform: "translate(-50%, -50%)",
              display: "grid",
              placeItems: "center",
              gap: 5,
              minWidth: 80,
              opacity: dead ? 0.45 : 1,
              filter: dead ? "grayscale(1)" : "none",
              zIndex: isTurn ? 5 : 2,
            }}
          >
            <div
              className={isTurn ? "seat-pulse" : ""}
              style={{
                width: 50,
                height: 50,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: dead
                  ? "rgba(255,255,255,0.03)"
                  : isTurn
                  ? "rgba(34,211,238,0.18)"
                  : isNext
                  ? "rgba(59,130,246,0.12)"
                  : isMe
                  ? "rgba(34,197,94,0.16)"
                  : "rgba(255,255,255,0.04)",
                border: isTurn
                  ? currentBorder
                  : isNext
                  ? responderBorder
                  : baseBorder,
                boxShadow: isTurn
                  ? `${currentGlow}, 0 7px 14px rgba(0,0,0,0.45)`
                  : isNext
                  ? `${responderGlow}, 0 6px 12px rgba(0,0,0,0.4)`
                  : "0 6px 12px rgba(0,0,0,0.45)",
              }}
            >
              {dead ? <DeadIcon /> : <PlayerIcon />}
            </div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                textAlign: "center",
                padding: "2px 6px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: dead ? "#9ca3af" : "var(--text)",
                maxWidth: 110,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </div>

            {isMe && (
              <div
                className="badge"
                style={{
                  fontSize: 9,
                  padding: "2px 6px",
                  borderColor: "var(--border-strong)",
                }}
              >
                YOU
              </div>
            )}

            {(isTurn || isNext) && !dead && (
              <div style={{ display: "flex", gap: 6 }}>
                {isTurn && (
                  <span className="badge" style={{ fontSize: 9 }}>
                    playing
                  </span>
                )}
                {isNext && !isTurn && (
                  <span className="badge" style={{ fontSize: 9 }}>
                    responder
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        .seat-pulse {
          animation: seatPulse 1.2s infinite ease-in-out;
        }
        @keyframes seatPulse {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function rotatePlayers(arr, startIndex) {
  if (startIndex <= 0) return arr;
  return [...arr.slice(startIndex), ...arr.slice(0, startIndex)];
}

function makeSeatCoords(n) {
  if (n <= 1) return [{ x: 50, y: 86 }];

  const coords = [];
  const cx = 50;
  const cy = 50;
  const rx = 30;
  const ry = 33;

  for (let i = 0; i < n; i++) {
    const angle = Math.PI / 2 - (i * (2 * Math.PI)) / n;
    coords.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return coords;
}

/* ---------------- Round Modal ---------------- */

function RoundModal({ modal }) {
  const isLiar = modal.result === "liar";
  const isPlayerOut = modal.result === "playerOut";
  const safeName = modal.winnerSafe;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.45)",
        zIndex: 100,
      }}
    >
      <div
        className="panel"
        style={{
          padding: "20px 24px",
          width: "min(520px, 92vw)",
          textAlign: "center",
          animation: "pop .18s ease-out",
        }}
      >
        {isPlayerOut ? (
          <>
            <div
              style={{
                fontSize: 48,
                fontWeight: 1000,
                letterSpacing: 1,
                color: "var(--accent-2)",
              }}
            >
              SAFE!
            </div>
            <div style={{ marginTop: 8, fontWeight: 900 }}>
              {safeName} emptied their hand
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Round ends immediately. Next chooser rotates.
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 50,
                fontWeight: 1000,
                letterSpacing: 1,
                color: isLiar ? "var(--danger)" : "var(--accent-2)",
              }}
            >
              {isLiar ? "LIAR!" : "TRUTH!"}
            </div>

            <div style={{ marginTop: 8, fontWeight: 800 }}>
              {modal.challenger} challenged {modal.liar}
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              {modal.loser} pulled the trigger…{" "}
              {modal.died ? "and died." : "and survived."}
            </div>
          </>
        )}
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

/* ---------------- Icons ---------------- */

function PlayerIcon() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor">
      <g id="about">
        <path d="M16,16A7,7,0,1,0,9,9,7,7,0,0,0,16,16ZM16,4a5,5,0,1,1-5,5A5,5,0,0,1,16,4Z" />
        <path d="M17,18H15A11,11,0,0,0,4,29a1,1,0,0,0,1,1H27a1,1,0,0,0,1-1A11,11,0,0,0,17,18ZM6.06,28A9,9,0,0,1,15,20h2a9,9,0,0,1,8.94,8Z" />
      </g>
    </svg>
  );
}

function DeadIcon() {
  return (
    <div style={{ position: "relative", width: 24, height: 24 }}>
      <PlayerIcon />
      <div
        style={{
          position: "absolute",
          inset: -6,
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          color: "#9ca3af",
        }}
      >
        ☠
      </div>
    </div>
  );
}