const { initConfig } = require('./Config');
const { initPlayers } = require('./Player');
const { initTeams } = require('./Team');
const { initAuction } = require('./Auction');

async function initializeModels() {
  await initConfig();
  await initPlayers();
  await initTeams();
  await initAuction();
}

module.exports = {
  initializeModels,
};
