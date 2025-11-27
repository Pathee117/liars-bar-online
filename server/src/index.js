// server/src/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

import { createLobby, getLobby, addPlayer, removePlayer } from "./lobbies.js";
import {
  buildDeck,
  shuffle,
  dealHands,
  makeInitialGameState,
  nextAliveIndex,
  isTruthfulPlay,
  publicSnapshot,
  checkWinner
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

      if (lobby.state === "playing" && lobby.game) {
        io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
      }
    }
  });

  socket.on("ping", (msg) => socket.emit("pong", { msg, at: Date.now() }));

  // Create lobby
  socket.on("lobby:create", ({ name }, cb) => {
    const lobby = createLobby(socket.id, (name || "Player").trim());
    socket.join(lobby.id);

    io.to(lobby.id).emit("lobby:update", lobby);
    io.to(lobby.id).emit("system:log", {
      type: "lobby:created",
      name: lobby.players[0].name
    });

    cb?.({ lobbyId: lobby.id });
  });

  // Join lobby
  socket.on("lobby:join", ({ lobbyId, name }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby) return cb?.({ error: "Lobby not found" });

    const trimmed = (name || "Player").trim();
    socket.join(lobbyId);

    // Midgame join => spectator unless reconnect by name
    if (lobby.state === "playing") {
      const existing = lobby.players.find(p => p.name === trimmed && !p.connected);
      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;

        io.to(lobbyId).emit("lobby:update", lobby);
        io.to(lobbyId).emit("system:log", {
          type: "player:reconnected",
          name: trimmed
        });

        io.to(socket.id).emit("game:update", publicSnapshot(lobby));
        io.to(socket.id).emit("hand:update", existing.hand || []);
        return cb?.({ ok: true, reconnected: true });
      }

      io.to(socket.id).emit("game:update", publicSnapshot(lobby));
      return cb?.({ ok: true, spectating: true });
    }

    const connectedCount = lobby.players.filter(p => p.connected).length;
    if (connectedCount >= 8) return cb?.({ error: "Lobby is full (8 max)" });

    const updated = addPlayer(lobbyId, socket.id, trimmed);
    io.to(lobbyId).emit("lobby:update", updated);

    io.to(lobbyId).emit("system:log", {
      type: "player:connected",
      name: trimmed
    });

    cb?.({ ok: true });
  });

  // Start game (host only) -> goes into chooseRank phase, NO DEAL YET
  socket.on("game:start", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby) return cb?.({ error: "Lobby not found" });
    if (lobby.hostSocketId !== socket.id)
      return cb?.({ error: "Only host can start" });
    if (lobby.state !== "lobby")
      return cb?.({ error: "Game already started" });

    const connectedPlayers = lobby.players.filter(p => p.connected);
    if (connectedPlayers.length < 2 || connectedPlayers.length > 8)
      return cb?.({ error: "Need 2–8 players" });

    lobby.state = "playing";
    lobby.game = makeInitialGameState(lobby);

    // reset hands + lives
    lobby.players.forEach(p => {
      p.lives = 3;
      p.hand = [];
    });

    // first chooser = first alive/connected
    let firstAlive = lobby.players.findIndex(p => p.connected && p.lives > 0);
    if (firstAlive === -1) firstAlive = 0;
    lobby.game.turnIndex = firstAlive;
    lobby.game.phase = "chooseRank";
    lobby.game.tableRank = null;

    io.to(lobby.id).emit("lobby:update", lobby);
    io.to(lobby.id).emit("system:log", {
      type: "game:started",
      by: lobby.players.find(p => p.socketId === socket.id)?.name || "Host"
    });

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  // --- NEW: chooser selects rank before deal ---
  socket.on("round:chooseRank", ({ lobbyId, rank }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "chooseRank")
      return cb?.({ error: "Not choosing rank now" });

    const chooser = lobby.players[g.turnIndex];
    if (!chooser || chooser.socketId !== socket.id)
      return cb?.({ error: "Only current player can choose rank" });

    const allowed = new Set(["A", "K", "Q", "J"]);
    if (!allowed.has(rank))
      return cb?.({ error: "Invalid rank" });

    g.tableRank = rank;
    g.phase = "round";

    // Deal 5 fresh cards to all active players
    const active = lobby.players.filter(p => p.connected && p.lives > 0);

    const deck = shuffle(buildDeck(active.length));
    const { hands, remainingDeck } = dealHands(deck, active, 5);

    active.forEach(p => {
      p.hand = hands.get(p.socketId) || [];
      io.to(p.socketId).emit("hand:update", p.hand);
    });

    g.remainingDeck = remainingDeck;
    g.deckCount = remainingDeck.length;

    io.to(lobby.id).emit("system:log", {
      type: "round:rankChosen",
      by: chooser.name,
      rank
    });

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  // Play cards (only during round phase)
  socket.on("turn:play", ({ lobbyId, cardIds, declaredCount }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "round")
      return cb?.({ error: "Round not started yet" });

    const current = lobby.players[g.turnIndex];
    if (!current || current.socketId !== socket.id)
      return cb?.({ error: "Not your turn" });

    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 3)
      return cb?.({ error: "Play 1–3 cards" });
    if (declaredCount !== cardIds.length)
      return cb?.({ error: "Declared count mismatch" });

    const cardsToPlay = [];
    for (const id of cardIds) {
      const idx = current.hand.findIndex(c => c.id === id);
      if (idx === -1) return cb?.({ error: "Card not in your hand" });
      cardsToPlay.push(current.hand[idx]);
    }

    current.hand = current.hand.filter(c => !cardIds.includes(c.id));
    g.pile.push(...cardsToPlay);

    g.lastPlay = {
      playerSocketId: current.socketId,
      playerName: current.name,
      count: declaredCount,
      cards: cardsToPlay
    };

    g.responderIndex = nextAliveIndex(lobby, g.turnIndex);

    io.to(current.socketId).emit("hand:update", current.hand);
    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  // Accept (only during round)
  socket.on("turn:accept", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "round")
      return cb?.({ error: "Round not started yet" });

    const responder = lobby.players[g.responderIndex];
    if (!responder || responder.socketId !== socket.id)
      return cb?.({ error: "Only responder can accept" });

    g.turnIndex = g.responderIndex;
    g.responderIndex = null;

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  // Challenge (end round -> switch to chooseRank, no deal yet)
  socket.on("turn:challenge", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "round")
      return cb?.({ error: "Round not started yet" });

    const responder = lobby.players[g.responderIndex];
    if (!responder || responder.socketId !== socket.id)
      return cb?.({ error: "Only responder can challenge" });

    const last = g.lastPlay;
    if (!last) return cb?.({ error: "Nothing to challenge" });

    const liar = lobby.players.find(p => p.socketId === last.playerSocketId);
    if (!liar) return cb?.({ error: "Player not found" });

    const truthful = isTruthfulPlay(last.cards, g.tableRank);

    let loser = null;
    let result = null;

    if (truthful) {
      responder.lives -= 1;
      loser = responder;
      result = "truth";
    } else {
      liar.lives -= 1;
      loser = liar;
      result = "liar";
    }

    // Send round summary for your modal
    io.to(lobby.id).emit("round:summary", {
      result: result === "liar" ? "liar" : "truth",
      liar: liar.name,
      challenger: responder.name,
      loser: loser.name,
      loserLives: loser.lives,
      previousRank: g.tableRank
    });

    // Clear round state
    g.pile = [];
    g.lastPlay = null;
    g.responderIndex = null;

    // Next chooser is responder (baseline rule)
    g.turnIndex = lobby.players.indexOf(responder);

    // Switch to chooseRank phase before any cards are dealt
    g.phase = "chooseRank";
    g.tableRank = null;

    // Winner check
    const winner = checkWinner(lobby);
    if (winner) {
      g.state = "ended";
      g.winner = winner.name;
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