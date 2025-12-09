const suitMap = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redSuits = new Set(["H", "D"]);

export default function CardView({ card, selected, disabled, onClick, faceDown }) {
  const isJoker = card.r === "JOKER";
  const isRed = redSuits.has(card.s);

  // ----- CARD BACK -----
  if (faceDown) {
    return (
      <div
        style={{
          width: 76,
          height: 108,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1e3a8a 100%)",
          boxShadow: "0 8px 18px rgba(0,0,0,0.45)",
          padding: 7,
          display: "grid",
          placeItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 6,
            border: "2px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
          }}
        />
        <div
          style={{
            fontSize: 32,
            color: "rgba(255,255,255,0.2)",
            fontWeight: 900,
          }}
        >
          ♠
        </div>
      </div>
    );
  }

  // ----- JOKER CARD -----
  if (isJoker) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 76,
          height: 108,
          borderRadius: 12,
          border: selected
            ? "2px solid var(--accent)"
            : "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, #07101f 0%, #05060a 100%)",
          color: "var(--accent)",
          boxShadow: selected
            ? "0 0 20px rgba(255,255,255,0.06), 0 0 26px rgba(34,211,238,0.45)"
            : "0 8px 18px rgba(0,0,0,0.45)",
          transform: selected ? "translateY(-7px)" : "translateY(0)",
          transition: "all 0.12s ease",
          cursor: disabled ? "not-allowed" : "pointer",
          padding: 7,
          display: "grid",
          placeItems: "center",
          fontWeight: 1000,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          opacity: disabled ? 0.8 : 1
        }}
        title="JOKER"
      >
        <div style={{ fontSize: 13, opacity: 0.9 }}>JOKER</div>
        <div style={{ fontSize: 26, lineHeight: 1 }}>★</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>WILD</div>
      </button>
    );
  }

  // ----- NORMAL CARD -----
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 76,
        height: 108,
        borderRadius: 12,
        border: selected
          ? "2px solid var(--accent)"
          : "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(180deg, #f8fafc 0%, #e5e7eb 100%)",
        color: "#05060a",
        boxShadow: selected
          ? "0 10px 22px rgba(34,211,238,0.45)"
          : "0 8px 18px rgba(0,0,0,0.35)",
        transform: selected ? "translateY(-7px)" : "translateY(0)",
        transition: "all 0.12s ease",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 7,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        opacity: disabled ? 0.8 : 1
      }}
      title={`${card.r}${suitMap[card.s]}`}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: isRed ? "#dc2626" : "#111",
          textAlign: "left"
        }}
      >
        {card.r}
      </div>

      <div
        style={{
          fontSize: 34,
          color: isRed ? "#dc2626" : "#111",
          lineHeight: 1,
          alignSelf: "center"
        }}
      >
        {suitMap[card.s]}
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          color: isRed ? "#dc2626" : "#111",
          textAlign: "right",
          transform: "rotate(180deg)"
        }}
      >
        {card.r}
      </div>
    </button>
  );
}