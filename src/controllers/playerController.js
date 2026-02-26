const { addPlayer, editPlayer, removePlayer, resetPlayer, getPlayers } = require('../models/Player');
const { validateImageData } = require('../services/validationService');

const imageStore = {};

function uploadImage(req, res) {
  const { data } = req.body;
  if (!validateImageData(data)) {
    return res.status(400).json({ error: 'Invalid image data' });
  }

  const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  imageStore[id] = data;
  return res.json({ url: `/api/img/${id}` });
}

function getImage(req, res) {
  const data = imageStore[req.params.id];
  if (!data) return res.status(404).send('Not found');

  const match = data.match(/^data:(.+);base64,(.+)$/);
  if (!match) return res.status(400).send('Bad data');

  res.setHeader('Content-Type', match[1]);
  return res.send(Buffer.from(match[2], 'base64'));
}

async function createPlayer(req, res) {
  const player = await addPlayer(req.body);
  return res.status(201).json(player);
}

async function updatePlayer(req, res) {
  const updated = await editPlayer({ ...req.body, id: Number(req.params.id) });
  if (!updated) return res.status(404).json({ error: 'Player not found' });
  return res.json(updated);
}

async function deletePlayer(req, res) {
  const removed = await removePlayer(Number(req.params.id));
  if (!removed) return res.status(404).json({ error: 'Player not found' });
  return res.status(204).send();
}

async function restorePlayer(req, res) {
  const player = await resetPlayer(Number(req.params.id));
  if (!player) return res.status(404).json({ error: 'Player not found' });
  return res.json(player);
}

function listPlayers(req, res) {
  return res.json(getPlayers());
}

module.exports = {
  uploadImage,
  getImage,
  createPlayer,
  updatePlayer,
  deletePlayer,
  restorePlayer,
  listPlayers,
};
