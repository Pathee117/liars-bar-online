import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { VERSION } from "../version";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");

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
    <div className="container" style={{ minHeight: "100%" }}>
      {/* HERO */}
      <div
        className="panel"
        style={{
          padding: 28,
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 18,
          alignItems: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Left */}
        <div className="grid" style={{ gap: 14 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="badge">Online Multiplayer</span>
            <span
              className="badge"
              style={{ borderColor: "var(--border-strong)" }}
            >
              2–8 Players
            </span>
            <span className="badge">No Account Needed</span>
          </div>

          <div>
            <h1
              className="h1"
              style={{ margin: "6px 0 6px", lineHeight: 1.05 }}
            >
              LIAR’S BAR
            </h1>
            <p className="muted" style={{ fontSize: 16, margin: 0 }}>
              Bluff your way through the table. Claim the rank, bait a
              challenge, and be the last player standing.
            </p>
          </div>

          {/* CTA */}
          <div className="panel-soft" style={{ padding: 14 }}>
            <label className="muted" style={{ fontSize: 13 }}>
              Your display name
            </label>
            <div className="row" style={{ marginTop: 8 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tharindu"
                onKeyDown={(e) => e.key === "Enter" && createLobby()}
              />
              <button onClick={createLobby} style={{ minWidth: 160 }}>
                Create Lobby
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              You’ll get a shareable link for your friends.
            </div>
          </div>

          {/* Quick rules */}
          <div
            className="grid"
            style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
          >
            <RuleCard
              title="Play 1–3 Cards"
              text="On your turn, place 1–3 cards face down."
              icon="🃏"
            />
            <RuleCard
              title="Responder Decides"
              text="Next player accepts or calls LIAR."
              icon="⚔️"
            />
            <RuleCard
              title="Lose Lives"
              text="Wrong call costs a life. Last alive wins."
              icon="❤️"
            />
          </div>
        </div>

        {/* Right “visual fill” panel */}
        <div
          style={{
            position: "relative",
            height: "100%",
            minHeight: 260,
          }}
        >
          <div
            className="panel-soft"
            style={{
              height: "100%",
              padding: 16,
              display: "grid",
              alignContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
                How a round works
              </div>
              <ol
                className="muted"
                style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 16 }}
              >
                <li>Table rank is announced (A / K / Q).</li>
                <li>Current player plays cards and declares count.</li>
                <li>Responder accepts or challenges.</li>
                <li>Challenge resolves, pile clears, new rank starts.</li>
              </ol>
            </div>

            <div className="panel" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Tip
              </div>
              <div style={{ fontWeight: 800 }}>
                Lying early builds trust. Lying late wins games.
              </div>
            </div>
          </div>

          {/* Neon accent background shapes */}
          <div
            style={{
              position: "absolute",
              inset: -60,
              background:
                "radial-gradient(320px 200px at 80% 10%, rgba(34,211,238,0.25), transparent 60%)," +
                "radial-gradient(260px 220px at 10% 90%, rgba(34,197,94,0.22), transparent 60%)",
              filter: "blur(30px)",
              zIndex: -1,
            }}
          />
        </div>
      </div>

      {/* LOWER STRIP */}
      <div
        className="panel-soft"
        style={{
          padding: 14,
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <InfoPill title="Invite friends" text="Share your lobby link." />
        <InfoPill
          title="Spectators allowed"
          text="Late joiners watch this match."
        />
        <InfoPill
          title="Reconnect safe"
          text="Drop & return without losing spot."
        />
      </div>

      <div
        className="muted"
        style={{ fontSize: 12, marginTop: 10, textAlign: "center" }}
      >
        Built for fast casual games. Best with voice chat.
      </div>

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

/* ---------- small local components ---------- */

function RuleCard({ title, text, icon }) {
  return (
    <div className="panel-soft" style={{ padding: 12 }}>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 18 }}>{icon}</div>
        <div style={{ fontWeight: 800 }}>{title}</div>
      </div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {text}
      </div>
    </div>
  );
}

function InfoPill({ title, text }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {text}
        </div>
      </div>
      <div className="badge" style={{ height: "fit-content" }}>
        i
      </div>
    </div>
  );
}
