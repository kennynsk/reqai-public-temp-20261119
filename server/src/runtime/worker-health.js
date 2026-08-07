import { createServer } from 'node:http';

export async function startWorkerHealthServer(config) {
  if (!config.process.workerHealthPort) return { beginDrain() {}, async close() {} };
  let ready = true;
  const server = createServer((request, response) => {
    if (request.url === '/health/live') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, role: config.process.role, site: config.process.siteId })); return; }
    if (request.url === '/health/ready') { response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: ready, role: config.process.role, site: config.process.siteId })); return; }
    response.writeHead(404); response.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.process.workerHealthPort, '0.0.0.0', resolve); });
  return { beginDrain() { ready = false; }, close() { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } };
}
