import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(configDir, '..', '..');
const projectDir = path.resolve(serverDir, '..');

let loaded = false;

export function loadEnvironmentFiles(env = process.env) {
  if (loaded && env === process.env) return;
  const raw = String(env.APP_ENV || env.NODE_ENV || 'dev').toLowerCase();
  const stage = raw === 'development' ? 'dev' : raw === 'production' ? 'prod' : raw;
  for (const envPath of [
    path.join(serverDir, `.env.${stage}`),
    path.join(projectDir, `.env.${stage}`),
    path.join(serverDir, '.env'),
    path.join(projectDir, '.env'),
  ]) {
    dotenv.config({ path: envPath, override: false, processEnv: env });
  }
  if (env === process.env) loaded = true;
}
