import { useEffect, useMemo, useRef, useState } from "react";

// Assets
const CYLINDER_SRC = "https://liar.tiny.pm/img/cylinder.svg";
const SPIN_SFX = "https://liar.tiny.pm/sounds/spin.mp3";
const CLICK_SFX = "https://liar.tiny.pm/sounds/click.mp3";
const SHOT_SFX = "https://liar.tiny.pm/sounds/shot.mp3";

/**
 * Props:
 * - open: boolean
 * - isMePending: boolean (true if THIS client must act)
 * - pendingName: string (loser name for display)
 * - canSpin?: boolean (server says whether spin is allowed; first penalty true, later false)
 * - onSpin: () => void (emit gun:spin)
 * - onFire: () => void (emit gun:fire)
 * - gunResult?: { died: boolean } (last gun result to drive sounds/auto-close UX)
 */
export default function RevolverModal({
  open,
  isMePending,
  pendingName,
  canSpin = true,
  onSpin,
  onFire,
  gunResult
}) {
  const [phase, setPhase] = useState("idle");
  // idle -> spinning -> spun -> readyToFire -> firing

  const [rotation, setRotation] = useState(0);
  const spinningRef = useRef(false);

  const spinAudioRef = useRef(null);
  const clickAudioRef = useRef(null);
  const shotAudioRef = useRef(null);

  // Reset modal when opened/closed or when canSpin changes
  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setRotation(0);
      spinningRef.current = false;
      return;
    }
    // If no spin allowed (second penalty), go straight to fire-ready
    if (!canSpin) {
      setPhase("readyToFire");
      setRotation(0);
    } else {
      setPhase("idle");
      setRotation(0);
    }
  }, [open, canSpin]);

  // Prepare audio objects once
  useEffect(() => {
    spinAudioRef.current = new Audio(SPIN_SFX);
    clickAudioRef.current = new Audio(CLICK_SFX);
    shotAudioRef.current = new Audio(SHOT_SFX);
  }, []);

  // Play sound on gunResult
  useEffect(() => {
    if (!open || !gunResult) return;
    if (gunResult.died) {
      shotAudioRef.current?.play().catch(() => {});
    } else {
      clickAudioRef.current?.play().catch(() => {});
    }
  }, [gunResult, open]);

  const handleSpin = () => {
    if (!isMePending || !canSpin) return;
    if (spinningRef.current) return;

    spinningRef.current = true;
    setPhase("spinning");

    spinAudioRef.current?.currentTime && (spinAudioRef.current.currentTime = 0);
    spinAudioRef.current?.play().catch(() => {});

    // Big random spin for drama
    const extraTurns = 3 + Math.floor(Math.random() * 4); // 3..6 turns
    const finalDeg = rotation + extraTurns * 360 + Math.floor(Math.random() * 360);
    setRotation(finalDeg);

    // Tell server to randomize bullet position (first penalty only)
    onSpin?.();

    // End spin after CSS transition
    setTimeout(() => {
      spinningRef.current = false;
      setPhase("readyToFire");
    }, 1400);
  };

  const handleFire = () => {
    if (!isMePending) return;
    if (phase !== "readyToFire") return;
    setPhase("firing");
    onFire?.();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.6)",
        zIndex: 200
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(540px, 94vw)",
          padding: "18px 18px 16px",
          textAlign: "center",
          animation: "pop .18s ease-out",
          // lighter inner surface for black SVG visibility
          background:
            "linear-gradient(180deg, #0f172a 0%, #0b1227 100%)"
        }}
      >
        <div className="badge" style={{ marginBottom: 8 }}>
          Revolver Penalty
        </div>

        <div style={{ fontWeight: 900, fontSize: 18 }}>
          {pendingName || "Player"} must pull the trigger
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {canSpin
            ? "First penalty: spin the cylinder, then fire."
            : "Second penalty: no reload, just fire."}
        </div>

        {/* Cylinder stage with improved contrast */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            placeItems: "center",
            padding: 14,
            borderRadius: 14,
            background:
              "radial-gradient(220px 160px at 50% 35%, rgba(255,255,255,0.12), transparent 60%), #0a0f1e",
            border: "1px solid rgba(255,255,255,0.1)"
          }}
        >
          <img
            src={CYLINDER_SRC}
            alt="Revolver cylinder"
            style={{
              width: 180,
              height: 180,
              transition: "transform 1.35s cubic-bezier(.2,.8,.2,1)",
              transform: `rotate(${rotation}deg)`,
              // add visibility + depth on dark art
              filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.8))"
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "center" }}>
          {canSpin && phase !== "readyToFire" && (
            <button
              onClick={handleSpin}
              disabled={!isMePending || phase === "spinning"}
              style={{ minWidth: 140 }}
            >
              {phase === "spinning" ? "Spinning..." : "Spin Cylinder"}
            </button>
          )}

          {phase === "readyToFire" && (
            <button
              onClick={handleFire}
              disabled={!isMePending || phase === "firing"}
              className="danger"
              style={{ minWidth: 140 }}
            >
              {phase === "firing" ? "Firing..." : "Fire"}
            </button>
          )}
        </div>

        {!isMePending && (
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Waiting for {pendingName}...
          </div>
        )}
      </div>

      <style>{`
        @keyframes pop {
          from { transform: scale(.96); opacity: .6; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}