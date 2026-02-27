const { getTeams, saveTeam, removeTeam } = require('../models/Team');

function listTeams(req, res) {
  return res.json(getTeams());
}

async function upsertTeam(req, res) {
  const team = await saveTeam(req.body);
  return res.json(team);
}

function uploadTeamLogo(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use field name "logo".' });
  }
  const url = `/api/teams/logo/${req.file.filename}`;
  return res.json({ url });
}

async function deleteTeam(req, res) {
  const removed = await removeTeam(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Team not found' });
  return res.status(204).send();
}

module.exports = {
  listTeams,
  upsertTeam,
  uploadTeamLogo,
  deleteTeam,
};
