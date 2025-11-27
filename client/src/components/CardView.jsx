const suitMap = { S: "♠", H: "♥", D: "♦", C: "♣" };
const redSuits = new Set(["H", "D"]);

export default function CardView({ card, selected, disabled, onClick }) {
  const isRed = redSuits.has(card.s);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 74,
        height: 104,
        borderRadius: 12,
        border: selected ? "2px solid #7c3aed" : "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%)",
        color: "#0b0f17",
        boxShadow: selected
          ? "0 10px 22px rgba(124,58,237,0.45)"
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
      <div style={{ fontSize: 15, fontWeight: 900, color: isRed ? "#dc2626" : "#111", textAlign: "left" }}>
        {card.r}
      </div>

      <div style={{ fontSize: 34, color: isRed ? "#dc2626" : "#111", lineHeight: 1, alignSelf: "center" }}>
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