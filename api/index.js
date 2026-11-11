import { createApp } from '../server/dist/app.js';
import { initDb } from '../server/dist/db/index.js';
import { loadConfig } from '../server/dist/lib/config.js';
import { applyDeclarativeConfigFromEnv } from '../server/dist/services/declarative-config.js';

let appInstance = null;

export default async function handler(req, res) {
  process.env.FREEAPI_DB_PATH = process.env.FREEAPI_DB_PATH || '/tmp/freeapi.db';
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '00c0cfd2cef8f53499559b80f062ad5ab5e909656d88cb3645dc2a719ee25ad5';

  if (!appInstance) {
    initDb(process.env.FREEAPI_DB_PATH);
    try {
      applyDeclarativeConfigFromEnv();
    } catch (e) {
      console.warn('Declarative config warning:', e.message);
    }
    const config = loadConfig();
    appInstance = createApp(config);
  }
  return appInstance(req, res);
}
