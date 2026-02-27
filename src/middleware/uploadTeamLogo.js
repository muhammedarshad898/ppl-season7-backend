const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, '../../uploads/teams');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (_) {}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const ext = (file.originalname && path.extname(file.originalname)) || '.png';
    const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.png';
    const name = `logo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${safeExt}`;
    cb(null, name);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /^image\/(jpe?g|png|gif|webp)$/i.test(file.mimetype);
  if (allowed) cb(null, true);
  else cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'), false);
};

const uploadTeamLogo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = { uploadTeamLogo, uploadDir };
