// server/src/gameLogic.js

// ---------- Rank rules ----------
export const RANKS = ["A", "K", "Q", "J"];

export function nextRankOf(rank) {
  if (!rank) return RANKS[0];
  const i = RANKS.indexOf(rank);
  return RANKS[(i + 1) % RANKS.length];
}

// ---------- Deck ----------
export function buildDeck(numPlayers) {
  // 1 full "liars deck" per 4 players (scales 2–8 nicely)
  const decksToUse = Math.ceil(numPlayers / 4);

  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "K", "Q", "J"];
  const deck = [];

  for (let d = 0; d < decksToUse; d++) {
    for (const r of ranks) {
      for (const s of suits) {
        deck.push({
          r,
          s,
          id: `${r}${s}-${d}-${Math.random().toString(36).slice(2, 8)}`
        });
      }
    }

    // 2 Jokers per deck
    for (let j = 0; j < 2; j++) {
      deck.push({
        r: "JOKER",
        s: "JOKER",
        id: `JOKER-${d}-${j}-${Math.random().toString(36).slice(2, 8)}`
      });
    }
  }

  return deck;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deal fixed hand size to each player at round start
export function dealHands(deck, players, handSize = 5) {
  const hands = new Map();
  let idx = 0;

  for (const p of players) {
    const h = [];
    for (let i = 0; i < handSize && idx < deck.length; i++) {
      h.push(deck[idx++]);
    }
    hands.set(p.socketId, h);
  }

  return { hands, remainingDeck: deck.slice(idx) };
}

// ---------- Game state ----------
export function makeInitialGameState(lobby, remainingDeck = []) {
  return {
    lobbyId: lobby.id,
    state: "playing",

    // chooseRank happens before cards are used this round
    phase: "chooseRank", // "chooseRank" | "round"
    tableRank: null,

    turnIndex: 0,
    responderIndex: null,

    pile: [],
    lastPlay: null,

    remainingDeck,
    deckCount: remainingDeck.length,

    winner: null,

    // --- gun / penalty flow ---
    pendingGunFor: null,        // socketId who must act now
    pendingChallenge: null      // stores challenge context until gun:fire
  };
}

// Reset per-round fields after a challenge resolves
export function resetForNextRound(lobby) {
  const g = lobby.game;
  g.phase = "chooseRank";
  g.tableRank = null;
  g.responderIndex = null;
  g.pile = [];
  g.lastPlay = null;
}

// ---------- Revolver helpers ----------
// Each alive player has their own revolver.
// 6 chambers, 1 bullet at random position.
export function newRevolver() {
  const bulletIndex = Math.floor(Math.random() * 6); // 0..5
  return { chamberIndex: 0, bulletIndex };
}

// Advance chamber and see if bullet fires
// Returns { fired: boolean, died: boolean }
export function pullTrigger(revolver) {
  revolver.chamberIndex = (revolver.chamberIndex + 1) % 6;
  const fired = revolver.chamberIndex === revolver.bulletIndex;
  return { fired, died: fired };
}

// ---------- Turn helpers ----------
export function nextAliveIndex(lobby, startIndex) {
  const players = lobby.players;
  const n = players.length;

  for (let step = 1; step <= n; step++) {
    const i = (startIndex + step) % n;
    const p = players[i];
    if (p.connected && p.alive) return i;
  }
  return startIndex;
}

export function nextResponderIndex(lobby, turnIndex) {
  return nextAliveIndex(lobby, turnIndex);
}

// ---------- Truth helpers ----------
export function isTruthfulPlay(cards, roundRank) {
  // Jokers are wild for the current rank
  return cards.every(c => c.r === roundRank || c.r === "JOKER");
}

// ---------- Winner ----------
export function checkWinner(lobby) {
  const alive = lobby.players.filter(p => p.alive);
  return alive.length === 1 ? alive[0] : null;
}

// ---------- Public snapshot for clients ----------
export function publicSnapshot(lobby) {
  const g = lobby.game;

  return {
    lobbyId: g.lobbyId,
    state: g.state,
    phase: g.phase,
    hostSocketId: lobby.hostSocketId,

    tableRank: g.tableRank,
    turnIndex: g.turnIndex,
    responderIndex: g.responderIndex,

    pileSize: g.pile.length,
    lastPlay: g.lastPlay
      ? { playerName: g.lastPlay.playerName, count: g.lastPlay.count }
      : null,

    deckCount: g.deckCount,
    winner: g.winner,

    players: lobby.players.map(p => ({
      socketId: p.socketId,
      name: p.name,
      alive: p.alive,
      cardsCount: p.hand?.length ?? 0,
      connected: p.connected
    }))
  };
}