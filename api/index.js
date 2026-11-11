import { createApp } from '../server/dist/app.js';
import { initDb } from '../server/dist/db/index.js';
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
    // This is needed because Vercel Serverless /tmp is ephemeral
    const adminEmail = process.env.FREEAPI_ADMIN_EMAIL;
    const adminPassword = process.env.FREEAPI_ADMIN_PASSWORD;
    if (adminEmail && adminPassword && userCount() === 0) {
      try {
        createUser(adminEmail, adminPassword);
        console.log('[FreeLLMAPI] Admin user auto-seeded from env vars:', adminEmail);
      } catch (e) {
        console.warn('[FreeLLMAPI] Could not auto-seed admin user:', e.message);
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
