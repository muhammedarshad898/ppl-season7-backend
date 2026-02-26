const { getPublicState } = require('../services/auctionService');

function getState(req, res) {
  res.json(getPublicState());
}

module.exports = {
  getState,
};
