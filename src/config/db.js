const mongoose = require('mongoose');

let memoryMode = false;

function getEnv(name, fallback) {
  return process.env[name] || fallback;
}

function toBool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function hasAnyDbEnv() {
  return !!(
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    process.env.MONGODB_URL
  );
}

function getMongoUri() {
  return (
    getEnv('MONGODB_URI', '') ||
    getEnv('MONGO_URI', '') ||
    getEnv('MONGODB_URL', '') ||
    (getEnv('DATABASE_URL', '').startsWith('mongodb') ? getEnv('DATABASE_URL', '') : '')
  );
}

/**
 * Connect to MongoDB. Call this before initializing models.
 * If no URI is set and REQUIRE_DB is not true, sets memoryMode (in-memory only).
 */
async function connectDB() {
  const allowMemoryFallback = !toBool(getEnv('REQUIRE_DB', 'false'));
  const uri = getMongoUri();

  if (!uri || !uri.trim()) {
    if (allowMemoryFallback) {
      memoryMode = true;
      console.warn('[DB] No MongoDB URI found. Starting in memory mode.');
      return;
    }
    throw new Error(
      'Database configuration missing. Set MONGODB_URI (or MONGO_URI, DATABASE_URL with mongodb://), or unset REQUIRE_DB.'
    );
  }

  memoryMode = false;
  await mongoose.connect(uri);
  console.log('[DB] MongoDB connected.');
}

module.exports = {
  connectDB,
  hasAnyDbEnv,
  get memoryMode() {
    return memoryMode;
  },
};
