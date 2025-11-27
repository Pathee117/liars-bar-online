// server/src/gameLogic.js

export function buildDeck(numPlayers) {
  const decksToUse = Math.ceil(numPlayers / 4);
  const suits = ["S", "H", "D", "C"];
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

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

export function makeInitialGameState(lobby) {
  return {
    lobbyId: lobby.id,
    state: "playing",          // overall match state
    phase: "chooseRank",       // "chooseRank" | "round"
    tableRank: null,           // chosen per round
    turnIndex: 0,              // current player (chooser at phase start)
    responderIndex: null,

    pile: [],
    lastPlay: null,

    remainingDeck: [],
    deckCount: 0,

    winner: null
  };
}

export function nextAliveIndex(lobby, startIndex) {
  const players = lobby.players;
  const n = players.length;

  for (let step = 1; step <= n; step++) {
    const i = (startIndex + step) % n;
    const p = players[i];
    if (p.connected && p.lives > 0) return i;
  }
  return startIndex;
}

// Jokers are always truthful
export function isTruthfulPlay(cards, roundRank) {
  return cards.every(c => c.r === roundRank || c.r === "JOKER");
}

export function checkWinner(lobby) {
  const alive = lobby.players.filter(p => p.lives > 0);
  return alive.length === 1 ? alive[0] : null;
}

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
      lives: p.lives,
      cardsCount: p.hand.length,
      connected: p.connected
    }))
  };
}