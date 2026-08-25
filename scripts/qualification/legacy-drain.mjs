import pg from 'pg';

const RETIRED_MODES = Object.freeze([
  'DECOMPOSITION_WITH_INSIGHTS',
  'STANDARD_RESEARCH',
  'AGENT_RESEARCH',
  'MODEL_COMPARE',
  'AGENT_COMPARE',
  'PROMPT_TEST',
]);
const ACTIVE_STATUSES = Object.freeze(['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED']);

function identifier(value, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`${name} contains unsupported characters`);
  return `"${value}"`;
}

export function legacyDrainQuery(schema = 'reqai') {
  const table = `${identifier(schema, 'DB_SCHEMA')}.jobs`;
  return {
    text: `SELECT configuration_snapshot->>'featureMode' AS mode, status, count(*)::integer AS count
      FROM ${table}
      WHERE configuration_snapshot->>'featureMode' = ANY($1::text[])
        AND status = ANY($2::text[])
      GROUP BY configuration_snapshot->>'featureMode', status
      ORDER BY mode, status`,
    values: [RETIRED_MODES, ACTIVE_STATUSES],
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(legacyDrainQuery(process.env.DB_SCHEMA || 'reqai'));
    const activeCount = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
    process.stdout.write(`${JSON.stringify({ qualified: activeCount === 0, activeCount, jobs: result.rows }, null, 2)}\n`);
    if (activeCount !== 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`legacy drain qualification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { ACTIVE_STATUSES, RETIRED_MODES };
