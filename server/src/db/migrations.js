import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

function render(sql, config) {
  return sql
    .replaceAll('{{APP_SCHEMA}}', quoteIdentifier(config.database.schema))
    .replaceAll('{{ARTIFACT_SCHEMA}}', quoteIdentifier(config.database.artifactSchema));
}

export async function runMigrations(pool, config, { directory = migrationsDir } = {}) {
  const appSchema = quoteIdentifier(config.database.schema);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${appSchema}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${appSchema}.schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
  for (const file of files) {
    const version = file.split('_', 1)[0];
    const exists = await pool.query(`SELECT 1 FROM ${appSchema}.schema_migrations WHERE version = $1`, [version]);
    if (exists.rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(render(await readFile(path.join(directory, file), 'utf8'), config));
      await client.query(`INSERT INTO ${appSchema}.schema_migrations(version) VALUES ($1)`, [version]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
