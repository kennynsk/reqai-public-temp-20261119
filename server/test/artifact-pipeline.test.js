import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { ArtifactRepository } from '../src/repositories/artifact-repository.js';
import { assertReferenceOnlyPayload } from '../src/events/reference-payload.js';

function pool() {
  const calls = []; let chunks = 0;
  const client = { async query(sql, params = []) { calls.push(sql); if (sql.includes('artifact_content') && sql.includes('INSERT')) chunks += 1; if (sql.includes('UPDATE "reqai".artifacts')) return { rows: [{ id: params[1], size_bytes: params[2], sha256: params[3], content_type: 'application/octet-stream', created_at: new Date() }] }; return { rows: [], rowCount: 1 }; }, release() {} };
  return { calls, get chunks() { return chunks; }, connect: async () => client };
}

test('100 MiB upload is chunked with bounded 1 MiB writes and checksum integrity', async () => {
  const db = pool(); const chunk = Buffer.alloc(1024 * 1024, 'a'); const hash = createHash('sha256'); for (let i = 0; i < 100; i += 1) hash.update(chunk);
  const readable = Readable.from((async function* () { for (let i = 0; i < 100; i += 1) yield chunk; })());
  const row = await new ArtifactRepository(db).upload({ tenantId: 't', ownerUserId: 'u', readable, expectedSha256: hash.digest('hex'), contentType: 'text/plain', maxBytes: 100 * 1024 * 1024, expiresAt: new Date() });
  assert.equal(Number(row.size_bytes), 100 * 1024 * 1024); assert.equal(db.chunks, 100); assert.ok(db.calls.includes('COMMIT'));
});

test('oversize or interrupted upload rolls back and never exposes an artifact', async () => {
  for (const readable of [Readable.from([Buffer.alloc(11)]), Readable.from((async function*(){ yield Buffer.from('x'); throw new Error('disconnect'); })())]) {
    const db = pool(); await assert.rejects(() => new ArtifactRepository(db).upload({ tenantId: 't', ownerUserId: 'u', readable, expectedSha256: '0'.repeat(64), contentType: 'text/plain', maxBytes: 10, expiresAt: new Date() })); assert.ok(db.calls.includes('ROLLBACK')); assert.equal(db.calls.includes('COMMIT'), false);
  }
});

test('control plane accepts artifact references and rejects content or oversized payloads', () => {
  assert.doesNotThrow(() => assertReferenceOnlyPayload({ jobId: 'j', inputArtifactId: 'a' }));
  assert.throws(() => assertReferenceOnlyPayload({ jobId: 'j', content: 'secret' }));
  assert.throws(() => assertReferenceOnlyPayload({ metadata: { value: 'x'.repeat(70_000) } }));
});

test('concurrent downloads preserve per-artifact chunk order', async () => {
  const contents = { a1: [Buffer.from('one-'), Buffer.from('two')], a2: [Buffer.from('alpha-'), Buffer.from('beta')] };
  const db = { async connect() { return { async query(sql, params = []) { if (sql.includes('SELECT chunk_index')) { const [, artifactId, after] = params; const rows = contents[artifactId].map((content, chunk_index) => ({ chunk_index, content })).filter((x) => x.chunk_index > after); return { rows }; } return { rows: [] }; }, release() {} }; } };
  const repository = new ArtifactRepository(db); const output = {};
  await Promise.all(Object.keys(contents).map(async (artifactId) => {
    const chunks = []; const writable = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
    await repository.streamTo({ tenantId: 't', artifactId, writable }); output[artifactId] = Buffer.concat(chunks).toString();
  }));
  assert.deepEqual(output, { a1: 'one-two', a2: 'alpha-beta' });
});
