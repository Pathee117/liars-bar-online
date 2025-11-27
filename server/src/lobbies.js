// server/src/lobbies.js

import crypto from "crypto";

const lobbies = new Map(); // lobbyId -> lobby

function makeId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

export function createLobby(hostSocketId, hostName = "Host") {
  const id = makeId();

  const lobby = {
    id,
    hostSocketId,
    state: "lobby", // "lobby" | "playing" | "ended"
    players: [
      {
        socketId: hostSocketId,
        name: hostName,
        connected: true,
        hand: [],
        lives: 3
      }
    ],
    game: null,
    systemEvent: null
  };

  lobbies.set(id, lobby);
  return lobby;
}

export function getLobby(id) {
  return lobbies.get(id) || null;
}

export function addPlayer(lobbyId, socketId, name) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return null;

  // If same name already exists and is disconnected, treat as reconnect pre-game
  const existingByName = lobby.players.find(p => p.name === name);
  if (existingByName && !existingByName.connected) {
    existingByName.socketId = socketId;
    existingByName.connected = true;
    lobby.systemEvent = { type: "player:reconnected", name };
    return lobby;
  }

  // If socket already exists, ignore
  const existingBySocket = lobby.players.find(p => p.socketId === socketId);
  if (existingBySocket) return lobby;

  lobby.players.push({
    socketId,
    name,
    connected: true,
    hand: [],
    lives: 3
  });

  lobby.systemEvent = { type: "player:connected", name };
  return lobby;
}

export function removePlayer(socketId) {
  for (const lobby of lobbies.values()) {
    const p = lobby.players.find(x => x.socketId === socketId);
    if (!p) continue;

    // Mark disconnected instead of removing
    p.connected = false;

    // If host disconnected, promote next connected player
    if (lobby.hostSocketId === socketId) {
      const nextHost = lobby.players.find(x => x.connected);
      if (nextHost) {
        lobby.hostSocketId = nextHost.socketId;
        lobby.systemEvent = {
          type: "host:changed",
          name: nextHost.name
        };
      } else {
        lobby.systemEvent = {
          type: "host:none"
        };
      }
    } else {
      lobby.systemEvent = {
        type: "player:disconnected",
        name: p.name
      };
    }

    return lobby;
  }

  return null;
}