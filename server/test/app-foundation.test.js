import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { loadBootstrapConfig } from '../src/config/bootstrap.js';

test('bootstrap config validates role and port', () => {
  assert.deepEqual(loadBootstrapConfig({ APP_ROLE: 'api', PORT: '8080', DEPLOYMENT_SITE_ID: 'dc-a' }), {
    role: 'api',
    port: 8080,
    siteId: 'dc-a',
  });
  assert.throws(() => loadBootstrapConfig({ APP_ROLE: 'unknown' }), /APP_ROLE/);
  assert.throws(() => loadBootstrapConfig({ APP_ROLE: 'api', PORT: '99999' }), /PORT/);
});

test('Express app can be constructed without opening a port', () => {
  const { app, readiness } = createApp({ siteId: 'test' });
  assert.equal(typeof app.listen, 'function');
  assert.equal(readiness.isReady(), true);
  readiness.beginDrain();
  assert.equal(readiness.isReady(), false);
});
