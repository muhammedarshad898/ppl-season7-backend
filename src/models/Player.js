const mongoose = require('mongoose');
const { avatarUrl } = require('../utils/helpers');
const db = require('../config/db');
const { defaultPlayers } = require('../config/defaultData');

// ── Mongoose Schema & Model ─────────────────────────────────────────────────

const playerSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    position: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    base_price: { type: Number, required: true },
    photo: { type: String, default: '' },
    status: { type: String, required: true, default: 'available' },
    sold_to: { type: String, default: null },
    sold_price: { type: Number, default: null },
  },
  {
    collection: 'players',
    timestamps: false,
  }
);

playerSchema.index({ id: 1 });

const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

// ── Persistence (MongoDB) ───────────────────────────────────────────────────

function docToPlayer(row) {
  return {
    id: Number(row.id),
    name: row.name,
    position: row.position,
    rating: Number(row.rating),
    basePrice: Number(row.base_price),
    photo: row.photo || '',
    status: row.status,
    soldTo: row.sold_to || undefined,
    soldPrice: row.sold_price === null || row.sold_price === undefined ? undefined : Number(row.sold_price),
  };
}

async function loadPlayers() {
  if (db.memoryMode) return [];
  const docs = await Player.find({}).sort({ id: 1 }).lean();
  return docs.map(docToPlayer);
}

async function savePlayers(players) {
  if (db.memoryMode) return;
  await Player.deleteMany({});
  if (players.length) {
    const docs = players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      rating: p.rating,
      base_price: p.basePrice,
      photo: p.photo || '',
      status: p.status,
      sold_to: p.soldTo ?? null,
      sold_price: p.soldPrice ?? null,
    }));
    await Player.insertMany(docs);
  }
}

// ── In-memory store & business logic ─────────────────────────────────────────

let players = [];

function normalizePlayer(player) {
  const next = {
    id: Number(player.id),
    name: player.name,
    position: player.position,
    rating: Number(player.rating),
    basePrice: Number(player.basePrice),
    photo: player.photo || '',
    status: player.status || 'available',
  };

  if (player.soldTo !== undefined) next.soldTo = player.soldTo;
  if (player.soldPrice !== undefined) next.soldPrice = Number(player.soldPrice);

  if (!next.photo) {
    next.photo = avatarUrl(next.name);
  }

  return next;
}

async function initPlayers() {
  const fromDb = await loadPlayers();
  if (fromDb.length) {
    players = fromDb.map(normalizePlayer);
    return;
  }

  players = defaultPlayers.map(normalizePlayer);
  await savePlayers(players);
}

function getPlayers() {
  return players;
}

function findPlayerById(playerId) {
  return players.find((player) => player.id === Number(playerId));
}

async function persistPlayers() {
  await savePlayers(players);
}

async function addPlayer(player) {
  const nextPlayer = normalizePlayer({
    ...player,
    id: Math.max(...players.map((p) => p.id), 0) + 1,
    status: 'available',
  });

  players.push(nextPlayer);
  await persistPlayers();
  return nextPlayer;
}

async function editPlayer(updated) {
  const index = players.findIndex((player) => player.id === Number(updated.id));
  if (index === -1) return null;

  const merged = normalizePlayer({ ...players[index], ...updated, id: players[index].id });
  players[index] = merged;
  await persistPlayers();
  return merged;
}

async function removePlayer(playerId) {
  const before = players.length;
  players = players.filter((player) => player.id !== Number(playerId));
  if (before === players.length) return false;
  await persistPlayers();
  return true;
}

async function resetPlayer(playerId) {
  const player = findPlayerById(playerId);
  if (!player) return null;

  player.status = 'available';
  delete player.soldTo;
  delete player.soldPrice;
  await persistPlayers();
  return player;
}

async function resetAllSoldOrUnsoldPlayers() {
  players.forEach((player) => {
    if (player.status === 'sold' || player.status === 'unsold') {
      player.status = 'available';
      delete player.soldTo;
      delete player.soldPrice;
    }
  });

  await persistPlayers();
}

async function replacePlayers(nextPlayers) {
  players = (Array.isArray(nextPlayers) ? nextPlayers : []).map(normalizePlayer);
  await persistPlayers();
}

module.exports = {
  Player,
  playerSchema,
  loadPlayers,
  savePlayers,
  initPlayers,
  getPlayers,
  findPlayerById,
  persistPlayers,
  addPlayer,
  editPlayer,
  removePlayer,
  resetPlayer,
  resetAllSoldOrUnsoldPlayers,
  replacePlayers,
};
