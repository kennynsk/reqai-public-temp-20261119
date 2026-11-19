import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';

test('Express app can be constructed without opening a port', () => {
  const { app, readiness } = createApp({ siteId: 'test' });
  assert.equal(typeof app.listen, 'function');
  assert.equal(readiness.isReady(), true);
  readiness.beginDrain();
  assert.equal(readiness.isReady(), false);
});

test('dynamic v1 responses forbid heuristic browser caching', async () => {
  const { app } = createApp({ siteId: 'test' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/api/v1', '/api/v1/jobs']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.headers.get('cache-control'), 'private, no-store', `missing no-store on ${path}`);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
