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
  checkWinner,
  newRevolver,
  pullTrigger,
} from "./gameLogic.js";

const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  /* ------------------------------------------------------------------ */
  /*                               GUN FLOW                             */
  /* ------------------------------------------------------------------ */

  // First penalty only: spin to (re)load cylinder. DOES NOT FIRE.
  socket.on("gun:spin", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "gun" || !g.pendingGunFor || !g.pendingGunMeta)
      return cb?.({ error: "No gun pending" });

    if (socket.id !== g.pendingGunFor)
      return cb?.({ error: "Not your gun to spin" });

    const loser = lobby.players.find((p) => p.socketId === g.pendingGunFor);
    if (!loser) return cb?.({ error: "Player not found" });

    // Only allowed on first penalty (no revolver yet)
    if (loser.revolver)
      return cb?.({ error: "Already loaded. No spin on later penalties." });

    // Create fresh revolver with random bullet chamber
    const rev = newRevolver();
    // Ensure first FIRE can hit any chamber (because pullTrigger increments first)
    rev.chamberIndex = 5;
    loser.revolver = rev;

    io.to(lobby.id).emit("gun:spun", {
      loserName: loser.name,
    });

    cb?.({ ok: true });
  });

  // Fire one chamber. If no bullet => click, if bullet => shot and death.
  socket.on("gun:fire", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "gun" || !g.pendingGunFor || !g.pendingGunMeta)
      return cb?.({ error: "No gun pending" });

    if (socket.id !== g.pendingGunFor)
      return cb?.({ error: "Not your gun to fire" });

    const loser = lobby.players.find((p) => p.socketId === g.pendingGunFor);
    if (!loser) return cb?.({ error: "Player not found" });

    if (!loser.revolver)
      return cb?.({ error: "Spin required before first fire" });

    const shot = pullTrigger(loser.revolver);

    if (shot.died) {
      loser.alive = false;
      loser.hand = [];
    }

    // Visual result for all clients (they decide click vs shot sound)
    io.to(lobby.id).emit("gun:result", {
      loserName: loser.name,
      fired: shot.fired,
      died: shot.died,
    });

    const meta = g.pendingGunMeta;

    // Round summary after the FIRE
    io.to(lobby.id).emit("round:summary", {
      result: meta.result === "liar" ? "liar" : "truth",
      liar: meta.liarName,
      challenger: meta.challengerName,
      loser: meta.loserName,
      previousRank: meta.previousRank,
      shotFired: shot.fired,
      died: shot.died,
      diedName: shot.died ? loser.name : null,
    });

    io.to(lobby.id).emit("system:log", {
      type: shot.died ? "player:died" : "player:survived",
      name: loser.name,
    });

    // Reset for next round
    g.pile = [];
    g.lastPlay = null;
    g.responderIndex = null;

    // ----------------------------------------------------------------
    // FIX: after gun fire, next chooser must go to NEXT player
    // (i.e., next alive AFTER the responder)
    const responder = lobby.players.find(
      (p) => p.socketId === meta.challengerSocketId
    );
    const responderIndex = responder
      ? lobby.players.indexOf(responder)
      : g.turnIndex;

    g.turnIndex = nextAliveIndex(lobby, responderIndex);
    // ----------------------------------------------------------------

    g.phase = "chooseRank";
    g.tableRank = null;

    // Clear pending gun
    g.pendingGunFor = null;
    g.pendingGunMeta = null;

    const winner = checkWinner(lobby);
    if (winner) {
      g.state = "ended";
      g.winner = winner.name;
      io.to(lobby.id).emit("system:log", {
        type: "game:ended",
        winner: winner.name,
      });
    }

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true, died: shot.died });
  });

  /* ------------------------------------------------------------------ */
  /*                            DISCONNECT                              */
  /* ------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------ */
  /*                              LOBBIES                               */
  /* ------------------------------------------------------------------ */

  socket.on("lobby:create", ({ name }, cb) => {
    const lobby = createLobby(socket.id, (name || "Player").trim());
    socket.join(lobby.id);

    io.to(lobby.id).emit("lobby:update", lobby);
    io.to(lobby.id).emit("system:log", {
      type: "lobby:created",
      name: lobby.players[0].name,
    });

    cb?.({ lobbyId: lobby.id });
  });

  socket.on("lobby:join", ({ lobbyId, name }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby) return cb?.({ error: "Lobby not found" });

    const trimmed = (name || "Player").trim();
    socket.join(lobbyId);

    if (lobby.state === "playing") {
      const existing = lobby.players.find(
        (p) => p.name === trimmed && !p.connected
      );
      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;

        io.to(lobbyId).emit("lobby:update", lobby);
        io.to(lobbyId).emit("system:log", {
          type: "player:reconnected",
          name: trimmed,
        });

        io.to(socket.id).emit("game:update", publicSnapshot(lobby));
        io.to(socket.id).emit("hand:update", existing.hand || []);
        return cb?.({ ok: true, reconnected: true });
      }

      io.to(socket.id).emit("game:update", publicSnapshot(lobby));
      return cb?.({ ok: true, spectating: true });
    }

    const connectedCount = lobby.players.filter((p) => p.connected).length;
    if (connectedCount >= 8) return cb?.({ error: "Lobby is full (8 max)" });

    const updated = addPlayer(lobbyId, socket.id, trimmed);
    io.to(lobbyId).emit("lobby:update", updated);

    io.to(lobbyId).emit("system:log", {
      type: "player:connected",
      name: trimmed,
    });

    cb?.({ ok: true });
  });

  /* ------------------------------------------------------------------ */
  /*                             GAME START                             */
  /* ------------------------------------------------------------------ */

  // Start game: NO revolvers preloaded. Guns appear only on first penalty.
  socket.on("game:start", ({ lobbyId }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby) return cb?.({ error: "Lobby not found" });
    if (lobby.hostSocketId !== socket.id)
      return cb?.({ error: "Only host can start" });
    if (lobby.state !== "lobby") return cb?.({ error: "Game already started" });

    // Remove disconnected players before starting the game
    lobby.players = lobby.players.filter((p) => p.connected);

    if (lobby.players.length < 2 || lobby.players.length > 8)
      return cb?.({ error: "Need 2–8 players" });

    lobby.state = "playing";
    lobby.game = makeInitialGameState(lobby);

    // reset match data on players
    lobby.players.forEach((p) => {
      p.alive = true;
      p.hand = [];
      p.revolver = null; // IMPORTANT: no reload at beginning
    });

    let firstAlive = lobby.players.findIndex((p) => p.connected && p.alive);
    if (firstAlive === -1) firstAlive = 0;

    lobby.game.turnIndex = firstAlive;
    lobby.game.phase = "chooseRank";
    lobby.game.tableRank = null;
    lobby.game.pendingGunFor = null;
    lobby.game.pendingGunMeta = null;

    io.to(lobby.id).emit("lobby:update", lobby);
    io.to(lobby.id).emit("system:log", {
      type: "game:started",
      by: lobby.players.find((p) => p.socketId === socket.id)?.name || "Host",
    });

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  /* ------------------------------------------------------------------ */
  /*                            ROUND SETUP                             */
  /* ------------------------------------------------------------------ */

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
    if (!allowed.has(rank)) return cb?.({ error: "Invalid rank" });

    g.tableRank = rank;
    g.phase = "round";

    const active = lobby.players.filter((p) => p.connected && p.alive);

    const deck = shuffle(buildDeck(active.length));
    const { hands, remainingDeck } = dealHands(deck, active, 5);

    active.forEach((p) => {
      p.hand = hands.get(p.socketId) || [];
      io.to(p.socketId).emit("hand:update", p.hand);
    });

    g.remainingDeck = remainingDeck;
    g.deckCount = remainingDeck.length;

    io.to(lobby.id).emit("system:log", {
      type: "round:rankChosen",
      by: chooser.name,
      rank,
    });

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });

  /* ------------------------------------------------------------------ */
  /*                                TURNS                               */
  /* ------------------------------------------------------------------ */

  socket.on("turn:play", ({ lobbyId, cardIds, declaredCount }, cb) => {
    const lobby = getLobby(lobbyId);
    if (!lobby || lobby.state !== "playing")
      return cb?.({ error: "No active game" });

    const g = lobby.game;
    if (g.phase !== "round") return cb?.({ error: "Round not started yet" });

    const current = lobby.players[g.turnIndex];
    if (!current || current.socketId !== socket.id)
      return cb?.({ error: "Not your turn" });
    if (!current.alive) return cb?.({ error: "You are dead" });

    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 3)
      return cb?.({ error: "Play 1–3 cards" });
    if (declaredCount !== cardIds.length)
      return cb?.({ error: "Declared count mismatch" });

    const cardsToPlay = [];
    for (const id of cardIds) {
      const idx = current.hand.findIndex((c) => c.id === id);
      if (idx === -1) return cb?.({ error: "Card not in hand" });
      cardsToPlay.push(current.hand[idx]);
    }

    // Remove from hand
    current.hand = current.hand.filter((c) => !cardIds.includes(c.id));

    // SAFE-ROUND RULE: empty hand ends the round immediately.
    if (current.hand.length === 0) {
      io.to(lobby.id).emit("system:log", {
        type: "round:playerOut",
        name: current.name,
      });

      io.to(lobby.id).emit("round:summary", {
        result: "playerOut",
        winnerSafe: current.name,
        previousRank: g.tableRank,
      });

      g.pile = [];
      g.lastPlay = null;
      g.responderIndex = null;

      g.turnIndex = nextAliveIndex(lobby, g.turnIndex);
      g.phase = "chooseRank";
      g.tableRank = null;

      const winner = checkWinner(lobby);
      if (winner) {
        g.state = "ended";
        g.winner = winner.name;
        io.to(lobby.id).emit("system:log", {
          type: "game:ended",
          winner: winner.name,
        });
      }

      io.to(current.socketId).emit("hand:update", current.hand);
      io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
      return cb?.({ ok: true, emptied: true });
    }

    // Normal round play continues
    g.pile.push(...cardsToPlay);

    g.lastPlay = {
      playerSocketId: current.socketId,
      playerName: current.name,
      count: declaredCount,
      cards: cardsToPlay,
    };

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
    if (g.phase !== "round") return cb?.({ error: "Round not started yet" });

    const responder = lobby.players[g.responderIndex];
    if (!responder || responder.socketId !== socket.id)
      return cb?.({ error: "Only responder can accept" });
    if (!responder.alive) return cb?.({ error: "You are dead" });

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
    if (g.phase !== "round") return cb?.({ error: "Round not started yet" });

    const responder = lobby.players[g.responderIndex];
    if (!responder || responder.socketId !== socket.id)
      return cb?.({ error: "Only responder can challenge" });
    if (!responder.alive) return cb?.({ error: "You are dead" });

    const last = g.lastPlay;
    if (!last) return cb?.({ error: "Nothing to challenge" });

    const liar = lobby.players.find((p) => p.socketId === last.playerSocketId);
    if (!liar) return cb?.({ error: "Player not found" });

    const truthful = isTruthfulPlay(last.cards, g.tableRank);
    const loser = truthful ? responder : liar;
    const result = truthful ? "truth" : "liar";

    // Enter gun phase and wait for client actions
    g.phase = "gun";
    g.pendingGunFor = loser.socketId;

    g.pendingGunMeta = {
      liarSocketId: liar.socketId,
      liarName: liar.name,
      challengerSocketId: responder.socketId,
      challengerName: responder.name,
      loserSocketId: loser.socketId,
      loserName: loser.name,
      previousRank: g.tableRank,
      result,
    };

    const canSpin = !loser.revolver; // first penalty only

    io.to(lobby.id).emit("gun:pending", {
      pendingGunFor: loser.socketId,
      loserName: loser.name,
      canSpin,
    });

    io.to(lobby.id).emit("game:update", publicSnapshot(lobby));
    cb?.({ ok: true });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("server listening on", PORT));