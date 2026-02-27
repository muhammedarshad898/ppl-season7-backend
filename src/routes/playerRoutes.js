const express = require('express');
const {
  uploadImage,
  getImage,
  uploadPlayerPhoto,
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayer,
  restorePlayer,
} = require('../controllers/playerController');
const { uploadPlayerPhoto: multerUpload } = require('../middleware/uploadPlayerPhoto');

const router = express.Router();

router.post('/upload', uploadImage);
router.get('/img/:id', getImage);
router.post('/players/upload-photo', multerUpload.single('photo'), uploadPlayerPhoto);

router.get('/players', listPlayers);
router.post('/players', createPlayer);
router.put('/players/:id', updatePlayer);
router.delete('/players/:id', deletePlayer);
router.post('/players/:id/reset', restorePlayer);

module.exports = router;
