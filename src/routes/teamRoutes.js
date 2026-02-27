const express = require('express');
const { listTeams, upsertTeam, deleteTeam, uploadTeamLogo } = require('../controllers/teamController');
const { uploadTeamLogo: multerUpload } = require('../middleware/uploadTeamLogo');

const router = express.Router();

router.get('/teams', listTeams);
router.post('/teams', upsertTeam);
router.post('/teams/upload-logo', multerUpload.single('logo'), uploadTeamLogo);
router.delete('/teams/:id', deleteTeam);

module.exports = router;
