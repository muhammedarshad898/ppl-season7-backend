const { verifyAdminPassword, updateConfig } = require('../models/Config');
const { addPlayer, editPlayer, removePlayer, resetPlayer } = require('../models/Player');
const { saveTeam, removeTeam } = require('../models/Team');
const { verifyAdminToken } = require('../services/authService');
const { exportBackupToFile, importBackup } = require('../services/backupService');
const {
  getPublicState,
  startAuction,
  placeBid,
  undoBid,
  markSold,
  markUnsold,
  revertLastSold,
  setIdle,
  resetAuctionAndTeams,
} = require('../services/auctionService');

/**
 * On server startup, fix stuck auction state so the UI shows "Start" again:
 * - If phase was "live" but timer already expired: mark unsold, then go idle.
 * - If phase is "unsold" or "sold" (lot already concluded): go idle so admin can start next player.
 */
async function reconcileAuctionTimerOnStartup(io) {
  const state = getPublicState().auctionState;
  const phase = state.phase;

  if (phase === 'live' && state.timerEndsAt && Date.now() > state.timerEndsAt) {
    const player = await markUnsold();
    if (player) {
      await setIdle();
      io.emit('stateUpdate', getPublicState());
    }
    return;
  }

  if (phase === 'unsold' || phase === 'sold') {
    await setIdle();
    io.emit('stateUpdate', getPublicState());
  }
}

function registerSocketHandlers(io) {
  let timerInterval = null;
  let lastTimerSecondNotified = null;
  let lastTimerSecondBroadcast = null;

  function broadcastState() {
    io.emit('stateUpdate', getPublicState());
  }

  function stopAuctionTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    lastTimerSecondNotified = null;
    lastTimerSecondBroadcast = null;
  }

  function getTimerRemainingSeconds() {
    const state = getPublicState().auctionState;
    if (!state.timerEndsAt) return 0;
    return Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
  }

  async function closeOnTimerEnd() {
    const state = getPublicState().auctionState;
    if (state.phase !== 'live') {
      stopAuctionTimer();
      return;
    }

    if (state.leadingTeam) {
      const result = await markSold();
      if (result.ok) {
        broadcastState();
        io.emit('playerSold', {
          player: result.player,
          team: result.team,
          price: result.price,
        });
      }
    } else {
      const player = await markUnsold();
      if (player) {
        broadcastState();
        io.emit('playerUnsold', { player });
      }
    }

    io.emit('timerExpired');
    stopAuctionTimer();

    // Return to idle so admin can start the next player without clicking Idle
    await setIdle();
    broadcastState();
  }

  function ensureAuctionTimer() {
    stopAuctionTimer();
    const state = getPublicState().auctionState;
    if (state.phase !== 'live' || !state.timerEndsAt) return;

    timerInterval = setInterval(async () => {
      const remaining = getTimerRemainingSeconds();
      if (remaining !== lastTimerSecondBroadcast) {
        lastTimerSecondBroadcast = remaining;
        io.emit('timerUpdate', { remaining });
      }

      if (remaining > 0 && remaining <= 3 && remaining !== lastTimerSecondNotified) {
        lastTimerSecondNotified = remaining;
        io.emit('timerFinalSeconds', { remaining });
      }

      if (remaining <= 0) {
        await closeOnTimerEnd();
      }
    }, 250);
  }

  function isAdmin(socket) {
    return !!socket.data?.isAdmin;
  }

  function denyIfNotAdmin(socket) {
    if (isAdmin(socket)) return false;
    socket.emit('authError', { msg: 'Admin authentication required.' });
    return true;
  }

  io.on('connection', (socket) => {
    socket.data.isAdmin = false;
    socket.emit('stateUpdate', getPublicState());
    console.log(`[+] ${socket.id}`);

    socket.on('admin:auth', ({ token }, cb) => {
      try {
        verifyAdminToken(token);
        socket.data.isAdmin = true;
        if (cb) cb({ ok: true });
      } catch (error) {
        socket.data.isAdmin = false;
        if (cb) cb({ ok: false });
      }
    });

    socket.on('admin:verifyPassword', async ({ password }, cb) => {
      const ok = await verifyAdminPassword(password);
      socket.data.isAdmin = ok;
      if (cb) cb({ ok });
    });

    socket.on('admin:startAuction', async ({ playerId }) => {
      if (denyIfNotAdmin(socket)) return;
      const started = await startAuction(playerId);
      if (!started) return;
      broadcastState();
      ensureAuctionTimer();
    });

    socket.on('placeBid', async ({ teamId, amount }) => {
      const result = await placeBid({ teamId, amount });

      if (!result.ok) {
        socket.emit('bidError', { msg: result.error });
        return;
      }

      broadcastState();
      io.emit('bidFlash', { team: result.team, amount: result.amount });
      ensureAuctionTimer();
    });

    socket.on('admin:undoBid', async () => {
      if (denyIfNotAdmin(socket)) return;
      const ok = await undoBid();
      if (!ok) return;

      broadcastState();
      io.emit('bidUndo');
      ensureAuctionTimer();
    });

    socket.on('admin:sold', async () => {
      if (denyIfNotAdmin(socket)) return;
      const result = await markSold();
      if (!result.ok) return;

      broadcastState();
      io.emit('playerSold', {
        player: result.player,
        team: result.team,
        price: result.price,
      });
      stopAuctionTimer();
      await setIdle();
      broadcastState();
    });

    socket.on('admin:unsold', async () => {
      if (denyIfNotAdmin(socket)) return;
      const player = await markUnsold();
      if (!player) return;

      broadcastState();
      io.emit('playerUnsold', { player });
      stopAuctionTimer();
      await setIdle();
      broadcastState();
    });

    socket.on('admin:revertLastSold', async (_, cb) => {
      if (denyIfNotAdmin(socket)) return;
      const result = await revertLastSold();
      if (!result.ok) {
        if (cb) cb({ ok: false, error: result.error || 'Revert failed.' });
        return;
      }

      broadcastState();
      io.emit('saleReverted', {
        player: result.player,
        team: result.team,
        price: result.price,
      });
      stopAuctionTimer();
      if (cb) cb({ ok: true });
    });

    socket.on('admin:idle', async () => {
      if (denyIfNotAdmin(socket)) return;
      await setIdle();
      broadcastState();
      stopAuctionTimer();
    });

    socket.on('admin:resetAllTeams', async () => {
      if (denyIfNotAdmin(socket)) return;
      await resetAuctionAndTeams();
      broadcastState();
      stopAuctionTimer();
    });

    socket.on('admin:addPlayer', async (player) => {
      if (denyIfNotAdmin(socket)) return;
      await addPlayer(player);
      broadcastState();
    });

    socket.on('admin:editPlayer', async (updated) => {
      if (denyIfNotAdmin(socket)) return;
      await editPlayer(updated);
      broadcastState();
    });

    socket.on('admin:removePlayer', async ({ playerId }) => {
      if (denyIfNotAdmin(socket)) return;
      await removePlayer(playerId);
      broadcastState();
    });

    socket.on('admin:resetPlayer', async ({ playerId }) => {
      if (denyIfNotAdmin(socket)) return;
      await resetPlayer(playerId);
      broadcastState();
    });

    socket.on('admin:saveTeam', async (team) => {
      if (denyIfNotAdmin(socket)) return;
      await saveTeam(team);
      broadcastState();
    });

    socket.on('admin:removeTeam', async ({ teamId }) => {
      if (denyIfNotAdmin(socket)) return;
      await removeTeam(teamId);
      broadcastState();
    });

    socket.on('admin:updateConfig', async (cfg) => {
      if (denyIfNotAdmin(socket)) return;
      await updateConfig(cfg || {});
      broadcastState();
      ensureAuctionTimer();
    });

    socket.on('admin:exportBackup', async (_, cb) => {
      if (denyIfNotAdmin(socket)) return;
      try {
        const { filename, snapshot } = await exportBackupToFile();
        if (cb) cb({ ok: true, filename, snapshot });
      } catch (error) {
        if (cb) cb({ ok: false, error: error.message });
      }
    });

    socket.on('admin:importBackup', async ({ payload }, cb) => {
      if (denyIfNotAdmin(socket)) return;
      try {
        await importBackup(payload);
        broadcastState();
        ensureAuctionTimer();
        io.emit('backupImported');
        if (cb) cb({ ok: true });
      } catch (error) {
        if (cb) cb({ ok: false, error: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[-] ${socket.id}`);
    });
  });

  ensureAuctionTimer();
}

module.exports = {
  registerSocketHandlers,
  reconcileAuctionTimerOnStartup,
};
