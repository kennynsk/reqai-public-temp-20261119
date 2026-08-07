import { execSync } from 'node:child_process';

const port = Number(process.env.PORT) || 5178;

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

const pidsRaw = run(`lsof -n -iTCP:${port} -sTCP:LISTEN -t`);
if (!pidsRaw) {
  process.exit(0);
}

const pids = Array.from(
  new Set(
    pidsRaw
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean),
  ),
);

for (const pid of pids) {
  const cmd = run(`ps -p ${pid} -o command=`);
  const isOldDevServer =
    cmd.includes('node') &&
    cmd.includes('index.js') &&
    (cmd.includes('/server/') || cmd === 'node index.js' || cmd.includes('--watch index.js'));

  if (!isOldDevServer) continue;

  try {
    process.kill(Number(pid), 'SIGTERM');
    // eslint-disable-next-line no-console
    console.log(`[predev] Stopped old server process on :${port} (pid ${pid})`);
  } catch {
    // ignore failures; server startup will show a clear error if port is still busy
  }
}
