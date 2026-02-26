const { getTeams, saveTeam, removeTeam } = require('../models/Team');

function listTeams(req, res) {
  return res.json(getTeams());
}

async function upsertTeam(req, res) {
  const team = await saveTeam(req.body);
  return res.json(team);
}

async function deleteTeam(req, res) {
  const removed = await removeTeam(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Team not found' });
  return res.status(204).send();
}

module.exports = {
  listTeams,
  upsertTeam,
  deleteTeam,
};
