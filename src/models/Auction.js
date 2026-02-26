const mongoose = require('mongoose');
const db = require('../config/db');
const { defaultAuctionState } = require('../config/defaultData');

// ── Mongoose Schema & Model ─────────────────────────────────────────────────

const auctionStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'auction' },
    phase: { type: String, required: true },
    current_player_json: { type: String, default: null },
    current_bid: { type: Number, default: 0 },
    leading_team_json: { type: String, default: null },
    bid_history_json: { type: String, default: '[]' },
    sold_players_json: { type: String, default: '[]' },
    timer_seconds: { type: Number, default: 10 },
    timer_ends_at: { type: Number, default: null },
    previous_bid_snapshot_json: { type: String, default: null },
  },
  {
    _id: true,
    collection: 'auction_state',
    timestamps: false,
  }
);

const AuctionState = mongoose.models.AuctionState || mongoose.model('AuctionState', auctionStateSchema);

// ── Persistence (MongoDB) ───────────────────────────────────────────────────

function parseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

async function loadAuctionState() {
  if (db.memoryMode) return null;
  const doc = await AuctionState.findById('auction').lean();
  if (!doc) return null;

  return {
    auctionState: {
      phase: doc.phase,
      currentPlayer: parseJSON(doc.current_player_json, null),
      currentBid: Number(doc.current_bid || 0),
      leadingTeam: parseJSON(doc.leading_team_json, null),
      bidHistory: parseJSON(doc.bid_history_json, []),
      soldPlayers: parseJSON(doc.sold_players_json, []),
      timerSeconds: Number(doc.timer_seconds || 10),
      timerEndsAt:
        doc.timer_ends_at === null || doc.timer_ends_at === undefined ? null : Number(doc.timer_ends_at),
    },
    previousBidSnapshot: parseJSON(doc.previous_bid_snapshot_json, null),
  };
}

async function saveAuctionState({ auctionState, previousBidSnapshot }) {
  if (db.memoryMode) return;
  await AuctionState.findByIdAndUpdate(
    'auction',
    {
      phase: auctionState.phase,
      current_player_json: JSON.stringify(auctionState.currentPlayer),
      current_bid: auctionState.currentBid,
      leading_team_json: JSON.stringify(auctionState.leadingTeam),
      bid_history_json: JSON.stringify(auctionState.bidHistory || []),
      sold_players_json: JSON.stringify(auctionState.soldPlayers || []),
      timer_seconds: Number(auctionState.timerSeconds || 10),
      timer_ends_at: auctionState.timerEndsAt === null ? null : Number(auctionState.timerEndsAt),
      previous_bid_snapshot_json: JSON.stringify(previousBidSnapshot),
    },
    { upsert: true, new: true }
  );
}

// ── In-memory store & business logic ─────────────────────────────────────────

let auctionState = { ...defaultAuctionState };
let previousBidSnapshot = null;

async function initAuction() {
  const fromDb = await loadAuctionState();
  if (fromDb) {
    auctionState = { ...defaultAuctionState, ...fromDb.auctionState };
    previousBidSnapshot = fromDb.previousBidSnapshot || null;
    return;
  }

  await persistAuctionState();
}

function getAuctionState() {
  return auctionState;
}

function setAuctionState(nextState) {
  auctionState = nextState;
  return auctionState;
}

function patchAuctionState(nextValues) {
  auctionState = { ...auctionState, ...nextValues };
  return auctionState;
}

function getPreviousBidSnapshot() {
  return previousBidSnapshot;
}

function setPreviousBidSnapshot(snapshot) {
  previousBidSnapshot = snapshot;
}

async function persistAuctionState() {
  await saveAuctionState({ auctionState, previousBidSnapshot });
}

async function replaceAuction(nextAuctionState, nextPreviousBidSnapshot = null) {
  auctionState = { ...defaultAuctionState, ...(nextAuctionState || {}) };
  previousBidSnapshot = nextPreviousBidSnapshot;
  await persistAuctionState();
}

module.exports = {
  AuctionState,
  auctionStateSchema,
  loadAuctionState,
  saveAuctionState,
  initAuction,
  getAuctionState,
  setAuctionState,
  patchAuctionState,
  getPreviousBidSnapshot,
  setPreviousBidSnapshot,
  persistAuctionState,
  replaceAuction,
};
