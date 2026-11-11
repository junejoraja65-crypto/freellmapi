import { createApp } from '../server/dist/app.js';
import { initDb, getDb } from '../server/dist/db/index.js';
import { loadConfig } from '../server/dist/lib/config.js';
import { applyDeclarativeConfigFromEnv } from '../server/dist/services/declarative-config.js';
import { createUser, userCount } from '../server/dist/services/auth.js';
import crypto from 'crypto';

let appInstance = null;

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function ensureDb() {
  process.env.FREEAPI_DB_PATH = process.env.FREEAPI_DB_PATH || '/tmp/freeapi.db';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '00c0cfd2cef8f53499559b80f062ad5ab5e909656d88cb3645dc2a719ee25ad5';

  if (!appInstance) {
    initDb(process.env.FREEAPI_DB_PATH);
    const db = getDb();

    // 1) Auto-seed admin user from env vars on every cold start
    // Needed because Vercel Serverless /tmp is ephemeral
    const adminEmail = process.env.FREEAPI_ADMIN_EMAIL;
    const adminPassword = process.env.FREEAPI_ADMIN_PASSWORD;
    let adminUserId = null;

    if (adminEmail && adminPassword && userCount() === 0) {
      try {
        const user = createUser(adminEmail, adminPassword);
        adminUserId = user.userId;
        console.log('[FreeLLMAPI] Admin user auto-seeded:', adminEmail);
      } catch (e) {
        console.warn('[FreeLLMAPI] Could not auto-seed admin user:', e.message);
      }
    }

    // 2) Seed a fixed session token so browser sessions survive cold starts
    // The session token is stored as SHA-256 hash in DB
    const fixedSessionToken = process.env.FREEAPI_SESSION_TOKEN;
    if (fixedSessionToken) {
      try {
        // Get admin user id if not just created
        if (!adminUserId) {
          const userRow = db.prepare('SELECT id FROM users LIMIT 1').get();
          adminUserId = userRow?.id;
        }
        if (adminUserId) {
          const tokenHash = sha256(fixedSessionToken);
          const expiresAt = Date.now() + (90 * 24 * 60 * 60 * 1000); // 90 days
          db.prepare('INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at_ms) VALUES (?, ?, ?)')
            .run(tokenHash, adminUserId, expiresAt);
          console.log('[FreeLLMAPI] Fixed session token seeded');
        }
      } catch (e) {
        console.warn('[FreeLLMAPI] Could not seed session token:', e.message);
      }
    }

    // 3) Seed a fixed unified API key from env var — stays stable across cold starts
    const fixedApiKey = process.env.FREEAPI_UNIFIED_KEY;
    if (fixedApiKey) {
      try {
        const existing = db.prepare("SELECT value FROM settings WHERE key = 'unified_api_key'").get();
        if (!existing || existing.value !== fixedApiKey) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('unified_api_key', ?)").run(fixedApiKey);
          console.log('[FreeLLMAPI] Unified API key seeded');
        }
      } catch (e) {
        console.warn('[FreeLLMAPI] Could not seed unified API key:', e.message);
      }
    }

    // 4) Apply declarative provider config (keys, models etc)
    try {
      applyDeclarativeConfigFromEnv();
    } catch (e) {
      console.warn('Declarative config warning:', e.message);
    }

    const config = loadConfig();
    appInstance = createApp(config);
  }
}

export default async function handler(req, res) {
  ensureDb();
  return appInstance(req, res);
}
