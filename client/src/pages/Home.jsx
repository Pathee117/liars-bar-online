// client/src/pages/Home.jsx
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
    <div className="container home-wrap" style={{ minHeight: "100%" }}>
      {/* HERO PANEL */}
      <div className="panel home-panel home-hero">
        {/* Left */}
        <div className="grid home-left">
          <div className="row home-badges">
            <span className="badge">Online Multiplayer</span>
            <span className="badge" style={{ borderColor: "var(--border-strong)" }}>
              2–8 Players
            </span>
            <span className="badge">No Account Needed</span>
          </div>

          <div>
            <h1 className="h1 home-title">LIAR’S BAR</h1>
            <p className="muted home-sub">
              Bluff your way through the table. Claim the rank, bait a challenge,
              and be the last player standing.
            </p>
          </div>

          {/* CTA */}
          <div className="panel-soft home-cta">
            <label className="muted" style={{ fontSize: 13 }}>
              Your display name
            </label>

            <div className="home-cta-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tharindu"
                onKeyDown={(e) => e.key === "Enter" && createLobby()}
              />
              <button onClick={createLobby} className="home-create-btn">
                Create Lobby
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              You’ll get a shareable link for your friends.
            </div>
          </div>

          {/* Quick rules */}
          <div className="grid home-rules">
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
              title="Penalty Gun"
              text="Wrong call earns a shot. Spin on first penalty."
              icon="🔫"
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="home-right">
          <div className="panel-soft home-right-card">
            <div>
              <div className="home-right-title">How a round works</div>
              <ol className="muted home-right-steps">
                <li>Chooser announces the table rank.</li>
                <li>Current player plays 1–3 cards and declares count.</li>
                <li>Responder accepts or calls LIAR.</li>
                <li>Penalty resolves, pile clears, new rank starts.</li>
              </ol>
            </div>

            <div className="panel home-tip">
              <div className="muted" style={{ fontSize: 12 }}>
                Tip
              </div>
              <div style={{ fontWeight: 800 }}>
                Lying early builds trust. Lying late wins games.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* LOWER STRIP */}
      <div className="panel-soft home-strip">
        <InfoPill title="Invite friends" text="Share your lobby link." />
        <InfoPill title="Spectators allowed" text="Late joiners can watch." />
        <InfoPill title="Reconnect safe" text="Drop & return without losing spot." />
      </div>

      <div className="muted home-foot">
        Built for fast casual games. Best with voice chat.
      </div>

      <div className="version-badge">v{VERSION}</div>

      <style>{styles}</style>
    </div>
  );
}

/* ---------- small local components ---------- */

function RuleCard({ title, text, icon }) {
  return (
    <div className="panel-soft home-rulecard">
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

const styles = `
  .home-wrap{
    min-height:100%;
    position:relative;
  }

  .home-panel{
    padding: clamp(14px, 2.2vw, 20px);
    position: relative;
    overflow: hidden;
    max-width: 980px;
    margin: 0 auto;
  }

  /* Ambient glow inside panel only (matches Lobby.jsx) */
  .home-panel::before{
    content:"";
    position:absolute;
    inset:-40%;
    background:
      radial-gradient(700px 380px at 0% 0%, rgba(124,58,237,0.18), transparent 60%),
      radial-gradient(600px 340px at 100% 10%, rgba(34,197,94,0.16), transparent 60%);
    filter: blur(30px);
    z-index:0;
  }
  .home-panel > * { position: relative; z-index: 1; }

  .home-hero{
    display:grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 14px;
    align-items: stretch;
  }

  .home-left{ gap: 12px; }
  .home-badges{ flex-wrap:wrap; gap:8px; }

  .home-title{
    margin: 6px 0 6px;
    line-height:1.05;
    letter-spacing:.8px;
  }
  .home-sub{
    font-size:16px;
    margin:0;
    line-height:1.6;
  }

  .home-cta{
    padding: 12px;
    border-color: rgba(255,255,255,0.08);
  }
  .home-cta-row{
    display:grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    margin-top: 8px;
  }
  .home-create-btn{
    min-width: 160px;
    border-radius: 12px;
    font-weight: 900;
    background: linear-gradient(90deg, rgba(124,58,237,0.85), rgba(34,211,238,0.9));
    box-shadow: 0 8px 22px rgba(0,0,0,0.45);
  }

  .home-rules{
    grid-template-columns: repeat(3, minmax(0,1fr));
    gap: 8px;
  }
  .home-rulecard{
    padding: 10px;
    border-color: rgba(255,255,255,0.08);
  }

  .home-right{
    position:relative;
    min-height: 240px;
  }
  .home-right-card{
    height:100%;
    padding: 12px;
    display:grid;
    gap:10px;
    align-content:space-between;
    border-color: rgba(255,255,255,0.08);
  }
  .home-right-title{
    font-weight: 900;
    font-size: 16px;
    margin-bottom: 6px;
  }
  .home-right-steps{
    font-size: 13px;
    line-height: 1.6;
    padding-left: 16px;
    margin: 0;
    display:grid;
    gap:4px;
  }
  .home-tip{
    padding: 10px;
    border-color: rgba(255,255,255,0.08);
  }

  .home-strip{
    padding: 12px;
    margin-top: 12px;
    display:grid;
    grid-template-columns: repeat(3, minmax(0,1fr));
    gap: 10px;
    max-width: 980px;
    margin-left:auto;
    margin-right:auto;
  }

  .home-foot{
    font-size: 12px;
    margin-top: 10px;
    text-align:center;
    max-width: 980px;
    margin-left:auto;
    margin-right:auto;
  }

  /* Responsive */
  @media (max-width: 900px){
    .home-hero{ grid-template-columns: 1fr; }
  }
  @media (max-width: 520px){
    .home-cta-row{ grid-template-columns: 1fr; }
    .home-rules{ grid-template-columns: 1fr; }
    .home-strip{ grid-template-columns: 1fr; }
  }

  .version-badge{
    position: fixed;
    bottom: 10px;
    right: 12px;
    fontSize: 11px;
    opacity: 0.6;
    font-weight: 800;
    letter-spacing: 0.5px;
    z-index: 999;
    pointer-events: none;
  }
`;