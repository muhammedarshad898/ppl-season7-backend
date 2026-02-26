const express = require('express');
const { listTeams, upsertTeam, deleteTeam } = require('../controllers/teamController');

const router = express.Router();

router.get('/teams', listTeams);
router.post('/teams', upsertTeam);
router.delete('/teams/:id', deleteTeam);

module.exports = router;
