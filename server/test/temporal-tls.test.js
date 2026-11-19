import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config/env.js';
import { temporalTlsOptions } from '../src/workflow/temporal-workflow-engine.js';

test('Temporal TLS returns explicit CA and client certificate; missing trust fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reqai-tls-'));
  try {
    for (const name of ['crt', 'key', 'ca']) await writeFile(join(dir, name), `synthetic-${name}`);
    const config = loadConfig({
      TEMPORAL_TLS_ENABLED: 'true', TEMPORAL_TLS_CERT_PATH: join(dir, 'crt'),
      TEMPORAL_TLS_KEY_PATH: join(dir, 'key'), TEMPORAL_TLS_CA_CERT_PATH: join(dir, 'ca'),
      TEMPORAL_TLS_SERVER_NAME: 'temporal.test',
    }, { loadFiles: false });
    const tls = await temporalTlsOptions(config);
    assert.equal(tls.serverRootCACertificate.toString(), 'synthetic-ca');
    assert.equal(tls.clientCertPair.crt.toString(), 'synthetic-crt');
    assert.equal(tls.clientCertPair.key.toString(), 'synthetic-key');
    assert.equal(tls.serverNameOverride, 'temporal.test');
    const { caCertPath, ...legacy } = config.temporal.tls;
    assert.ok(caCertPath);
    assert.equal('serverRootCACertificate' in await temporalTlsOptions({ temporal: { tls: legacy } }), false);
    assert.equal(await temporalTlsOptions({ temporal: { tls: { enabled: false } } }), undefined);
    await assert.rejects(temporalTlsOptions({ temporal: { tls: { ...legacy, caCertPath: join(dir, 'missing') } } }), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true }); }
});
