const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { defaultConfig } = require('../config/defaultData');

// ── Mongoose Schema & Model ─────────────────────────────────────────────────

const configSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'config' },
    configJson: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    _id: true,
    collection: 'config_store',
    timestamps: false,
  }
);

const Config = mongoose.models.Config || mongoose.model('Config', configSchema);

// ── Persistence (MongoDB) ───────────────────────────────────────────────────

function parseJSON(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

async function loadConfig() {
  if (db.memoryMode) return null;
  const doc = await Config.findById('config').lean();
  if (!doc) return null;
  return parseJSON(doc.configJson, null);
}

async function saveConfig(config) {
  if (db.memoryMode) return;
  await Config.findByIdAndUpdate(
    'config',
    {
      configJson: JSON.stringify(config),
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );
}

// ── In-memory store & business logic ─────────────────────────────────────────

let config = { ...defaultConfig };

function isPasswordHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$/.test(value);
}

async function ensurePasswordHash() {
  if (isPasswordHash(config.adminPassword)) return;

  config.adminPassword = await bcrypt.hash(
    String(config.adminPassword || defaultConfig.adminPassword),
    10
  );
  await saveConfig(config);
}

async function initConfig() {
  const fromDb = await loadConfig();
  if (fromDb) {
    config = { ...config, ...fromDb };
  } else {
    await saveConfig(config);
  }

  await ensurePasswordHash();
}

function getConfig() {
  return config;
}

async function verifyAdminPassword(password) {
  if (!password) return false;

  if (!isPasswordHash(config.adminPassword)) {
    await ensurePasswordHash();
  }

  return bcrypt.compare(String(password), config.adminPassword);
}

async function updateConfig(nextConfig) {
  if (nextConfig.adminPassword !== undefined) {
    config.adminPassword = await bcrypt.hash(String(nextConfig.adminPassword), 10);
  }

  const { adminPassword, ...rest } = nextConfig;
  config = { ...config, ...rest };
  await saveConfig(config);
  return config;
}

async function replaceConfigFromBackup(nextConfig) {
  if (!nextConfig || typeof nextConfig !== 'object') return config;
  const { adminPassword, ...safeConfig } = nextConfig;
  config = { ...config, ...safeConfig };
  await saveConfig(config);
  return config;
}

module.exports = {
  Config,
  configSchema,
  loadConfig,
  saveConfig,
  initConfig,
  getConfig,
  updateConfig,
  verifyAdminPassword,
  replaceConfigFromBackup,
};
