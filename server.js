const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB } = require('./src/config/db');
const { initializeModels } = require('./src/models/initModels');
const playerRoutes = require('./src/routes/playerRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const auctionRoutes = require('./src/routes/auctionRoutes');
const authRoutes = require('./src/routes/authRoutes');
const { registerSocketHandlers, reconcileAuctionTimerOnStartup } = require('./src/socket/socketHandler');
const { getConfig } = require('./src/models/Config');
const { helmet, cors, apiLimiter, createCorsOptions } = require('./src/config/security');
const { startAutoBackupJob } = require('./src/services/backupService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: createCorsOptions(),
});

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors(createCorsOptions()));
app.use(apiLimiter);
app.use(express.json({ limit: '15mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'ppl-auction', ts: new Date().toISOString() });
});

app.use('/api', authRoutes);
app.use('/api', playerRoutes);
app.use('/api', teamRoutes);
app.use('/api', auctionRoutes);

registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => initializeModels())
  .then(() => reconcileAuctionTimerOnStartup(io))
  .then(() => {
    const backupIntervalMs = Number(process.env.AUTO_BACKUP_INTERVAL_MS || 30_000);
    startAutoBackupJob(backupIntervalMs);

    server.listen(PORT, () => {
      console.log(`\nPPL Auction Backend -> http://localhost:${PORT}`);
      console.log(`API     -> http://localhost:${PORT}/api`);
      console.log(`Health  -> http://localhost:${PORT}/health`);
      console.log('\nAdmin password is securely stored (hashed).\n');
      console.log(`Auto backup every ${Math.floor(backupIntervalMs / 1000)}s.`);
      const cfg = getConfig();
      if (!cfg.adminPassword) {
        console.warn('Admin password is not configured.');
      }
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    console.error('DB env detected:', {
      MONGODB_URI: !!process.env.MONGODB_URI,
      MONGO_URI: !!process.env.MONGO_URI,
      DATABASE_URL: !!process.env.DATABASE_URL,
    });
    process.exit(1);
  });
