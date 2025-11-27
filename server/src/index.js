// server/src/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

import {
  createLobby,
  getLobby,
  addPlayer,
  removePlayer
} from "./lobbies.js";

import {
  buildDeck,
  shuffle,
  dealHands,
  makeInitialGameState,
  nextAliveIndex,
  isTruthfulPlay,
  publicSnapshot,
  checkWinner,
  pickNextTableRank,
  drawIfEmpty
} from "./gameLogic.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("disconnect", () => {
    const lobby = removePlayer(socket.id);
    if (lobby) {
      io.to(lobby.id).emit("lobby:update", lobby);

      if (lobby.systemEvent) {
        io.to(lobby.id).emit("system:log", lobby.systemEvent);
        lobby.systemEvent = null;
      }

      // If game running, refresh public snapshot for everyone
      if (lobby.state === "playing" && lobby.game) {
        io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
      }
    }
  });

  socket.on("ping", (msg) => {
    socket.emit("pong", { msg, at: Date.now() });
  });

  // ----------------
  // Lobby lifecycle
  // ----------------

  socket.on("lobby:create", ({ name }, cb) => {
    const lobby = createLobby(socket.id, (name || "Player").trim());
    socket.join(lobby.id);
    io.to(lobby.id).emit("lobby:update", lobby);
    cb?.({ lobbyId: lobby.id });
  });

  socket.on("lobby:join", ({ lobbyId, name }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby) return cb?.({ error: "Lobby not found" });

    const trimmed = (name || "Player").trim();
    socket.join(lobbyId);

    // ----- If game is playing, allow ONLY reconnects -----
    if (lobby.state === "playing") {
      // Find an existing player by name who is disconnected
      const existing = lobby.players.find(
        p => p.name === trimmed && !p.connected
      );

      if (existing) {
        // Reconnect as the same player
        existing.socketId = socket.id;
        existing.connected = true;

        io.to(lobbyId).emit("lobby:update", lobby);
        io.to(lobbyId).emit("system:log", {
          type: "player:reconnected",
          name: trimmed
        });

        // Send public snapshot + their private hand
        if (lobby.game) {
          io.to(socket.id).emit("game:update", publicSnapshot(lobby));
          io.to(socket.id).emit("hand:update", existing.hand || []);
        }

        return cb?.({ ok: true, reconnected: true });
      }

      // Otherwise spectator only
      if (lobby.game) {
        io.to(socket.id).emit("game:update", publicSnapshot(lobby));
      }
      return cb?.({
        error: "Game already started. You are spectating this round."
      });
    }
    // ----------------------------------------------------

    // Normal lobby join pre-game
    const updated = addPlayer(lobbyId, socket.id, trimmed);

    io.to(lobbyId).emit("lobby:update", updated);
    io.to(lobbyId).emit("system:log", {
      type: "player:connected",
      name: trimmed
    });

    cb?.({ ok: true });
  });

  // -----------
  // Start game
  // -----------

  socket.on("game:start", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby) return cb?.({ error: "Lobby not found" });
    if (lobby.hostSocketId !== socket.id)
      return cb?.({ error: "Only host can start" });
    if (lobby.state !== "lobby")
      return cb?.({ error: "Game already started" });

    const connectedPlayers = lobby.players.filter(p => p.connected);

    if (connectedPlayers.length < 2)
      return cb?.({ error: "Need at least 2 connected players" });
    if (connectedPlayers.length > 8)
      return cb?.({ error: "Max 8 players" });

    lobby.state = "playing";

    // Build enough decks for total roster size (2–8 supported)
    const deck = shuffle(buildDeck(lobby.players.length));

    // Deal only to currently connected players
    const { hands, remainingDeck } = dealHands(deck, connectedPlayers, 5);

    // Reset lives for all; only connected get hands now
    lobby.players.forEach(p => {
      p.lives = 3;
      if (p.connected) {
        p.hand = hands.get(p.socketId) || [];
      } else {
        p.hand = []; // disconnected at start
      }
    });

    lobby.game = makeInitialGameState(lobby, remainingDeck);

    // First turn = first connected alive player
    let firstAlive = lobby.players.findIndex(p => p.connected && p.lives > 0);
    if (firstAlive === -1) firstAlive = 0;
    lobby.game.turnIndex = firstAlive;

    // Private hands to connected players only
    connectedPlayers.forEach(p => {
      io.to(p.socketId).emit("hand:update", p.hand);
    });

    // Public snapshot
    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));

    const hostName =
      lobby.players.find(p => p.socketId === socket.id)?.name || "Host";
    io.to(lobby.id).emit("system:log", {
      type: "game:started",
      by: hostName
    });

    cb?.({ ok: true });
  });

  // -------------------------
  // Turn loop (authoritative)
  // -------------------------

  socket.on("turn:play", ({ lobbyId, cardIds, declaredCount }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    const current = lobby.players[g.turnIndex];

    if (!current || current.socketId !== socket.id)
      return cb?.({ error: "Not your turn" });

    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 3)
      return cb?.({ error: "Play 1–3 cards" });

    if (declaredCount !== cardIds.length)
      return cb?.({ error: "Declared count mismatch" });

    if (current.lives <= 0 || !current.connected)
      return cb?.({ error: "You are eliminated" });

    // Validate ownership + collect cards
    const cardsToPlay = [];
    for (const id of cardIds) {
      const idx = current.hand.findIndex(c => c.id === id);
      if (idx === -1) return cb?.({ error: "Card not in your hand" });
      cardsToPlay.push(current.hand[idx]);
    }

    // Remove played cards
    current.hand = current.hand.filter(c => !cardIds.includes(c.id));

    // If empty, draw new hand
    drawIfEmpty(lobby, current.socketId, 5);

    // Update pile + lastPlay
    g.pile.push(...cardsToPlay);
    g.lastPlay = {
      playerSocketId: current.socketId,
      playerName: current.name,
      count: declaredCount,
      cards: cardsToPlay
    };

    // Next responder (skips disconnected / eliminated)
    g.responderIndex = nextAliveIndex(lobby, g.turnIndex);

    io.to(current.socketId).emit("hand:update", current.hand);
    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));

    cb?.({ ok: true });
  });

  socket.on("turn:accept", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    const responder = lobby.players[g.responderIndex];

    if (!responder || responder.socketId !== socket.id)
      return cb?.({ error: "Only responder can accept" });

    if (responder.lives <= 0 || !responder.connected)
      return cb?.({ error: "You are eliminated" });

    g.turnIndex = g.responderIndex;
    g.responderIndex = null;

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  socket.on("turn:challenge", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    const responder = lobby.players[g.responderIndex];

    if (!responder || responder.socketId !== socket.id)
      return cb?.({ error: "Only responder can challenge" });

    const last = g.lastPlay;
    if (!last) return cb?.({ error: "Nothing to challenge" });

    const liar = lobby.players.find(p => p.socketId === last.playerSocketId);
    if (!liar) return cb?.({ error: "Liar not found" });

    const truthful = isTruthfulPlay(last.cards, g.tableRank);

    if (truthful) {
      responder.lives -= 1;
      io.to(lobby.id).emit("system:log", {
        type: "challenge:failed",
        by: responder.name
      });
    } else {
      liar.lives -= 1;
      io.to(lobby.id).emit("system:log", {
        type: "challenge:success",
        by: responder.name,
        liar: liar.name
      });
    }

    // Reset round
    g.pile = [];
    g.lastPlay = null;

    // Next turn = responder
    g.turnIndex = g.responderIndex;
    g.responderIndex = null;

    // Rotate table rank for next round
    g.tableRank = pickNextTableRank(g.tableRank);
    io.to(lobby.id).emit("system:log", {
      type: "round:new",
      rank: g.tableRank
    });

    const winner = checkWinner(lobby);
    if (winner) {
      io.to(lobby.id).emit("system:log", {
        type: "game:ended",
        winner: winner.name
      });
    }

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("server listening on", PORT));