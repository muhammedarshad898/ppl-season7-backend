const { getConfig } = require('../models/Config');
const {
  getPlayers,
  findPlayerById,
  resetAllSoldOrUnsoldPlayers,
  persistPlayers,
} = require('../models/Player');
const {
  getTeams,
  findTeamById,
  resetAllTeams,
  persistTeams,
} = require('../models/Team');
const {
  getAuctionState,
  setAuctionState,
  patchAuctionState,
  getPreviousBidSnapshot,
  setPreviousBidSnapshot,
  persistAuctionState,
} = require('../models/Auction');
const { sanitizeConfig } = require('../utils/helpers');
const { computeAnalytics } = require('./analyticsService');

function getIncrement(currentBid) {
  const config = getConfig();
  return currentBid < config.thresholdBid ? config.highIncrement : config.lowIncrement;
}

function getTeamMaxBid(team) {
  const config = getConfig();
  const players = getPlayers();
  const auctionState = getAuctionState();
  const remaining = team.budget - team.spent;
  const haveNow = team.players.length;
  const stillNeed = Math.max(0, config.minPlayersPerTeam - haveNow - 1);

  if (stillNeed === 0) return remaining;

  const pool = players
    .filter((player) => player.status === 'available' && player.id !== auctionState.currentPlayer?.id)
    .map((player) => player.basePrice)
    .sort((a, b) => a - b)
    .slice(0, stillNeed);

  while (pool.length < stillNeed) {
    pool.push(pool[pool.length - 1] ?? 0);
  }

  const reserve = pool.reduce((sum, value) => sum + value, 0);
  return Math.max(0, remaining - reserve);
}

function getPublicState() {
  const auctionState = getAuctionState();
  const now = Date.now();
  const computedTimerRemaining = auctionState.timerEndsAt
    ? Math.max(0, Math.ceil((auctionState.timerEndsAt - now) / 1000))
    : 0;

  return {
    auctionState: {
      ...auctionState,
      timerRemaining: computedTimerRemaining,
    },
    teams: getTeams(),
    players: getPlayers(),
    config: sanitizeConfig(getConfig()),
    analytics: computeAnalytics({ teams: getTeams(), players: getPlayers(), config: getConfig() }),
  };
}

async function startAuction(playerId) {
  const player = findPlayerById(playerId);
  if (!player || player.status !== 'available') return false;

  const currentState = getAuctionState();
  const config = getConfig();
  const timerSeconds = Number(config.auctionTimerSeconds || 10);
  setPreviousBidSnapshot(null);
  setAuctionState({
    phase: 'live',
    currentPlayer: player,
    currentBid: player.basePrice,
    leadingTeam: null,
    bidHistory: [],
    soldPlayers: currentState.soldPlayers,
    timerSeconds,
    timerEndsAt: Date.now() + (timerSeconds * 1000),
  });
  await persistAuctionState();

  return true;
}

async function placeBid({ teamId, amount }) {
  const auctionState = getAuctionState();
  if (auctionState.phase !== 'live') {
    return { ok: false, error: 'Auction is not live.' };
  }

  const team = findTeamById(teamId);
  if (!team) {
    return { ok: false, error: 'Team not found.' };
  }

  const numericAmount = Number(amount);
  const remaining = team.budget - team.spent;
  const maxBid = getTeamMaxBid(team);
  const basePrice = auctionState.currentPlayer?.basePrice ?? 0;

  if (numericAmount < basePrice) {
    return { ok: false, error: `Bid must be at least base price ${basePrice}` };
  }

  if (auctionState.leadingTeam && numericAmount <= auctionState.currentBid) {
    return { ok: false, error: `Bid ${numericAmount} must exceed current bid ${auctionState.currentBid}` };
  }

  if (numericAmount > remaining) {
    return { ok: false, error: `${team.name} has no budget (${remaining} left).` };
  }

  if (numericAmount > maxBid) {
    const config = getConfig();
    const need = config.minPlayersPerTeam - team.players.length - 1;
    return {
      ok: false,
      error: `${team.name} must keep budget for ${need} more player${need !== 1 ? 's' : ''}. Max bid: ${maxBid}`,
    };
  }

  setPreviousBidSnapshot({
    currentBid: auctionState.currentBid,
    leadingTeam: auctionState.leadingTeam,
    bidHistory: [...auctionState.bidHistory],
  });

  auctionState.currentBid = numericAmount;
  auctionState.leadingTeam = {
    id: team.id,
    name: team.name,
    color: team.color,
    logo: team.logo,
  };
  auctionState.bidHistory.unshift({
    team: team.name,
    color: team.color,
    logo: team.logo,
    amount: numericAmount,
    ts: Date.now(),
  });
  auctionState.timerEndsAt = Date.now() + (Number(auctionState.timerSeconds || 10) * 1000);

  await persistAuctionState();
  return { ok: true, team, amount: numericAmount, player: auctionState.currentPlayer };
}

async function undoBid() {
  const auctionState = getAuctionState();
  const snapshot = getPreviousBidSnapshot();

  if (!snapshot || auctionState.phase !== 'live') {
    return false;
  }

  auctionState.currentBid = snapshot.currentBid;
  auctionState.leadingTeam = snapshot.leadingTeam;
  auctionState.bidHistory = snapshot.bidHistory;
  setPreviousBidSnapshot(null);
  await persistAuctionState();

  return true;
}

async function markSold() {
  const auctionState = getAuctionState();
  if (auctionState.phase !== 'live' || !auctionState.leadingTeam) {
    return { ok: false };
  }

  const player = auctionState.currentPlayer;
  const team = findTeamById(auctionState.leadingTeam.id);
  const price = auctionState.currentBid;
  if (!player || !team) return { ok: false };

  player.status = 'sold';
  player.soldTo = team.name;
  player.soldPrice = price;

  team.spent += price;
  team.players.push({ ...player });

  auctionState.phase = 'sold';
  auctionState.timerEndsAt = null;
  auctionState.soldPlayers = [
    ...auctionState.soldPlayers,
    { player, team: team.name, teamColor: team.color, teamLogo: team.logo, price },
  ];

  setPreviousBidSnapshot(null);
  await Promise.all([persistPlayers(), persistTeams(), persistAuctionState()]);
  return { ok: true, player, team, price };
}

async function markUnsold() {
  const auctionState = getAuctionState();
  if (!auctionState.currentPlayer) return null;

  const player = findPlayerById(auctionState.currentPlayer.id);
  if (player) {
    player.status = 'unsold';
  }

  auctionState.phase = 'unsold';
  auctionState.timerEndsAt = null;
  setPreviousBidSnapshot(null);
  await Promise.all([persistPlayers(), persistAuctionState()]);

  return auctionState.currentPlayer;
}

async function revertLastSold() {
  const auctionState = getAuctionState();
  if (auctionState.phase === 'live') {
    return { ok: false, error: 'Cannot revert while auction is live.' };
  }

  const soldPlayers = auctionState.soldPlayers || [];
  if (!soldPlayers.length) {
    return { ok: false, error: 'No sold player to revert.' };
  }

  const lastSale = soldPlayers[soldPlayers.length - 1];
  const soldPlayerId = Number(lastSale?.player?.id);
  const revertPrice = Number(lastSale?.price || 0);
  const soldToName = lastSale?.team;

  const player = findPlayerById(soldPlayerId);
  if (!player) {
    return { ok: false, error: 'Sold player not found.' };
  }

  const team = getTeams().find((candidate) => candidate.name === soldToName);

  player.status = 'available';
  delete player.soldTo;
  delete player.soldPrice;

  if (team) {
    team.spent = Math.max(0, Number(team.spent || 0) - revertPrice);
    const idx = team.players.findIndex((p) => Number(p.id) === soldPlayerId);
    if (idx >= 0) {
      team.players.splice(idx, 1);
    }
  }

  auctionState.soldPlayers = soldPlayers.slice(0, -1);
  if (
    auctionState.phase === 'sold'
    && Number(auctionState.currentPlayer?.id) === soldPlayerId
  ) {
    auctionState.phase = 'idle';
    auctionState.currentPlayer = null;
    auctionState.currentBid = 0;
    auctionState.leadingTeam = null;
    auctionState.bidHistory = [];
  }
  auctionState.timerEndsAt = null;
  setPreviousBidSnapshot(null);

  await Promise.all([persistPlayers(), persistTeams(), persistAuctionState()]);
  return { ok: true, player, team, price: revertPrice };
}

async function setIdle() {
  patchAuctionState({
    phase: 'idle',
    currentPlayer: null,
    currentBid: 0,
    leadingTeam: null,
    bidHistory: [],
    timerEndsAt: null,
  });
  setPreviousBidSnapshot(null);
  await persistAuctionState();
}

async function resetAuctionAndTeams() {
  await resetAllTeams();
  await resetAllSoldOrUnsoldPlayers();

  setAuctionState({
    phase: 'idle',
    currentPlayer: null,
    currentBid: 0,
    leadingTeam: null,
    bidHistory: [],
    soldPlayers: [],
    timerSeconds: Number(getConfig().auctionTimerSeconds || 10),
    timerEndsAt: null,
  });

  setPreviousBidSnapshot(null);
  await persistAuctionState();
}

module.exports = {
  getIncrement,
  getTeamMaxBid,
  getPublicState,
  startAuction,
  placeBid,
  undoBid,
  markSold,
  markUnsold,
  revertLastSold,
  setIdle,
  resetAuctionAndTeams,
};
