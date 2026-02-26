const express = require('express');
const {
  uploadImage,
  getImage,
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  restorePlayer,
} = require('../controllers/playerController');

const router = express.Router();

router.post('/upload', uploadImage);
router.get('/img/:id', getImage);

router.get('/players', listPlayers);
router.post('/players', createPlayer);
router.put('/players/:id', updatePlayer);
router.delete('/players/:id', deletePlayer);
router.post('/players/:id/reset', restorePlayer);

module.exports = router;
