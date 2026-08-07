import { loadConfig } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrations.js';
import { createDatabasePool } from '../src/db/pool.js';

const config = loadConfig();
const pool = createDatabasePool(config);
try {
  await runMigrations(pool, config);
  process.stdout.write('Database migrations completed\n');
} finally {
  await pool.end();
}
