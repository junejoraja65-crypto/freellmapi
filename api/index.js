import { createApp } from '../server/dist/app.js';
import { initDb, getDb } from '../server/dist/db/index.js';
import { loadConfig } from '../server/dist/lib/config.js';
import { applyDeclarativeConfigFromEnv } from '../server/dist/services/declarative-config.js';
import { createUser, userCount } from '../server/dist/services/auth.js';

let appInstance = null;

function ensureDb() {
  process.env.FREEAPI_DB_PATH = process.env.FREEAPI_DB_PATH || '/tmp/freeapi.db';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '00c0cfd2cef8f53499559b80f062ad5ab5e909656d88cb3645dc2a719ee25ad5';

  if (!appInstance) {
    initDb(process.env.FREEAPI_DB_PATH);

    // Auto-seed admin user from env vars on every cold start
    // Needed because Vercel Serverless /tmp is ephemeral per cold-start
    const adminEmail = process.env.FREEAPI_ADMIN_EMAIL;
    const adminPassword = process.env.FREEAPI_ADMIN_PASSWORD;
    if (adminEmail && adminPassword && userCount() === 0) {
      try {
        createUser(adminEmail, adminPassword);
        console.log('[FreeLLMAPI] Admin user auto-seeded:', adminEmail);
      } catch (e) {
        console.warn('[FreeLLMAPI] Could not auto-seed admin user:', e.message);
      }
    }

    // Seed a fixed unified API key from env var so it stays stable across cold starts
    const fixedApiKey = process.env.FREEAPI_UNIFIED_KEY;
    if (fixedApiKey) {
      try {
        const db = getDb();
        const existing = db.prepare("SELECT value FROM settings WHERE key = 'unified_api_key'").get();
        if (!existing || existing.value !== fixedApiKey) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('unified_api_key', ?)").run(fixedApiKey);
          console.log('[FreeLLMAPI] Unified API key seeded from env var');
        }
      } catch (e) {
        console.warn('[FreeLLMAPI] Could not seed unified API key:', e.message);
      }
    }

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
