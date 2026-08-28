import { loadConfig } from '../src/config/env.js';
import { createDatabasePool } from '../src/db/pool.js';
import { JobRepository } from '../src/repositories/job-repository.js';

const args = process.argv.slice(2);
const tenantId = args[args.indexOf('--tenant') + 1];
const batches = Number(args.includes('--batches') ? args[args.indexOf('--batches') + 1] : 1);
if (!args.includes('--tenant') || !tenantId || tenantId.startsWith('--') || !Number.isInteger(batches) || batches < 1 || batches > 100) throw new Error('Usage: node scripts/backfill-job-metadata.mjs --tenant <trusted-tenant-id> [--batches 1..100]');
const config = loadConfig();
const pool = createDatabasePool(config);
try {
  const repository = new JobRepository(pool);
  let updated = 0;
  for (let batch = 0; batch < batches; batch += 1) {
    const count = await repository.backfillMetadata({ tenantId, limit: 100 });
    updated += count;
    if (count < 100) break;
  }
  process.stdout.write(`Indexed ${updated} jobs. Re-run safely to resume.\n`);
} finally { await pool.end(); }
