// server/src/gameLogic.js

// ---------- Deck / shuffle / deal ----------

export function buildDeck(numPlayers) {
  // 1 deck per 4 players
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
  }
  return deck;
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function dealHands(deck, players, handSize = 5) {
  const hands = new Map(); // socketId -> cards[]
  for (const p of players) hands.set(p.socketId, []);

  let idx = 0;
  for (let c = 0; c < handSize; c++) {
    for (const p of players) {
      hands.get(p.socketId).push(deck[idx++]);
    }
  }

  return {
    hands,
    remainingDeck: deck.slice(idx)
  };
}

// ---------- Game init ----------

export function makeInitialGameState(lobby, remainingDeck) {
  return {
    lobbyId: lobby.id,
    state: "playing",
    tableRank: "A",
    turnIndex: 0,
    responderIndex: null,
    direction: 1,
    pile: [],
    lastPlay: null,
    remainingDeck,
    deckCount: remainingDeck.length,
    winner: null
  };
}

// ---------- Turn helpers ----------

export function nextAliveIndex(lobby, startIndex) {
  const players = lobby.players;
  const n = players.length;
  const dir = lobby.game.direction;

  let i = startIndex;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    const p = players[i];
    if (p.connected && p.lives > 0) return i;
  }
  return startIndex;
}

export function isTruthfulPlay(cards, tableRank) {
  return cards.every(c => c.r === tableRank || c.r === "JOKER");
}

// MVP: simple rotation among A/K/Q
export function pickNextTableRank(currentRank) {
  const ranks = ["A", "K", "Q", "J"];
  const idx = ranks.indexOf(currentRank);
  return ranks[(idx + 1) % ranks.length];
}


export function checkWinner(lobby) {
  const alive = lobby.players.filter(p => p.connected && p.lives > 0);
  if (alive.length <= 1) {
    lobby.state = "ended";
    lobby.game.state = "ended";
    lobby.game.winner = alive[0]?.name || "No one";
    return alive[0] || null;
  }
  return null;
}

// Public snapshot for clients (derived fresh every emit).
export function publicSnapshot(lobby) {
  const g = lobby.game;

  return {
    lobbyId: g.lobbyId,
    state: g.state,
    tableRank: g.tableRank,
    turnIndex: g.turnIndex,
    responderIndex: g.responderIndex,
    direction: g.direction,

    pileSize: g.pile.length,
    lastPlay: g.lastPlay
      ? {
          playerName: g.lastPlay.playerName,
          count: g.lastPlay.count
        }
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