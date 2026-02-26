const fs = require('fs/promises');
const path = require('path');

const { getConfig, replaceConfigFromBackup } = require('../models/Config');
const { getPlayers, replacePlayers } = require('../models/Player');
const { getTeams, replaceTeams } = require('../models/Team');
const {
  getAuctionState,
  getPreviousBidSnapshot,
  replaceAuction,
} = require('../models/Auction');
const { sanitizeConfig } = require('../utils/helpers');

const BACKUP_DIR = path.join(process.cwd(), 'backups');

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function buildSnapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      config: sanitizeConfig(getConfig()),
      players: getPlayers(),
      teams: getTeams(),
      auctionState: getAuctionState(),
      previousBidSnapshot: getPreviousBidSnapshot(),
    },
  };
}

async function writeSnapshotToFile(snapshot, prefix = 'auction-backup') {
  await ensureBackupDir();
  const filename = `${prefix}-${ts()}.json`;
  const fullpath = path.join(BACKUP_DIR, filename);
  await fs.writeFile(fullpath, JSON.stringify(snapshot, null, 2), 'utf8');
  return { filename, fullpath };
}

async function exportBackupToFile() {
  const snapshot = buildSnapshot();
  const file = await writeSnapshotToFile(snapshot, 'manual-export');
  return {
    ...file,
    snapshot,
  };
}

async function createAutoBackup() {
  const snapshot = buildSnapshot();
  return writeSnapshotToFile(snapshot, 'auto-backup');
}

function normalizeIncomingSnapshot(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== 'object' || !parsed.data) {
    throw new Error('Invalid backup format.');
  }

  const { config, players, teams, auctionState, previousBidSnapshot } = parsed.data;
  if (!Array.isArray(players) || !Array.isArray(teams) || !auctionState || typeof auctionState !== 'object') {
    throw new Error('Backup missing required sections.');
  }

  return {
    config: config || {},
    players,
    teams,
    auctionState,
    previousBidSnapshot: previousBidSnapshot ?? null,
  };
}

async function importBackup(payload) {
  const normalized = normalizeIncomingSnapshot(payload);

  await replaceConfigFromBackup(normalized.config);
  await replacePlayers(normalized.players);
  await replaceTeams(normalized.teams);
  await replaceAuction(normalized.auctionState, normalized.previousBidSnapshot);

  return normalized;
}

function startAutoBackupJob(intervalMs = 30_000) {
  let running = false;
  const interval = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await createAutoBackup();
    } catch (error) {
      console.error('Auto-backup failed:', error.message);
    } finally {
      running = false;
    }
  }, intervalMs);

  return () => clearInterval(interval);
}

module.exports = {
  BACKUP_DIR,
  buildSnapshot,
  exportBackupToFile,
  createAutoBackup,
  importBackup,
  startAutoBackupJob,
};
