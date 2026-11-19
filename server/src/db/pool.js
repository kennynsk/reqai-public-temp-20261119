import fs from 'node:fs';

import pg from 'pg';

const { Pool } = pg;

function sslOptions(database) {
  if (database.sslMode === 'disable') return false;
  const ssl = {
    rejectUnauthorized: database.sslMode === 'verify-ca' || database.sslMode === 'verify-full',
  };
  if (database.caCertPath) ssl.ca = fs.readFileSync(database.caCertPath, 'utf8');
  return ssl;
}

export function createDatabasePool(config, { PoolClass = Pool } = {}) {
  if (!config.database.url) throw new Error('DATABASE_URL is required to create a database pool');
  return new PoolClass({
    connectionString: config.database.url,
    min: config.database.poolMin,
    max: config.database.poolMax,
    connectionTimeoutMillis: config.database.connectTimeoutMs,
    statement_timeout: config.database.statementTimeoutMs,
    application_name: `reqai-${config.process.role}-${config.process.siteId}`,
    ssl: sslOptions(config.database),
  });
}

export async function checkDatabaseHealth(pool) {
  const startedAt = Date.now();
  await pool.query('SELECT 1 AS ok');
  return { ok: true, latencyMs: Date.now() - startedAt };
}
