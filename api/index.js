import { createApp } from '../server/dist/app.js';
import { initDb } from '../server/dist/db/index.js';
import { loadConfig } from '../server/dist/lib/config.js';
import { applyDeclarativeConfigFromEnv } from '../server/dist/services/declarative-config.js';

let appInstance = null;

export default async function handler(req, res) {
  if (!appInstance) {
    process.env.FREEAPI_DB_PATH = process.env.FREEAPI_DB_PATH || '/tmp/freeapi.db';
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

