import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnterpriseActivityHandlers } from '../src/activities/enterprise-handlers.js';
import { createTextMaterialValidator } from '../src/domain/text-material.js';
import { sourceCoverageFor, validateSourceCoverage } from '../src/domain/babok-semantics.js';

test('storage boundaries preserve Cyrillic, emoji and CRLF while chunking', async () => {
  for (const text of ['x'.repeat(1048575) + 'яEND', 'x'.repeat(1048575) + '😀END', 'x'.repeat(1048575) + '\r\nEND', 'x'.repeat(239999) + '😀END']) {
    const bytes = Buffer.from(text), saved = [];
    const handlers = createEnterpriseActivityHandlers({ config: { llm: { chunkTargetTokens: 60000 }, retention: { intermediateDays: 1 }, jobs: { resultMaxBytes: 104857600 } }, modelExecutor: {}, artifactRepository: {
      async *readChunks() { yield bytes.subarray(0, 1048576); yield bytes.subarray(1048576); },
      async createText({ text }) { saved.push(text); return { artifactId: `chunk-${saved.length}` }; },
    } });
    await handlers.planChunks({ tenantId: 't', ownerUserId: 'u', inputArtifactId: 'a', configurationSnapshot: {} });
    assert.equal(saved.join(''), text.replace(/\r\n/g, '\n'));
  }
});

test('materials reject binary MIME, malformed UTF-8, disguised binary, empty and whitespace streams', () => {
  assert.throws(() => createTextMaterialValidator('application/pdf'), { code: 'UNSUPPORTED_MATERIAL_TYPE' });
  for (const bytes of [Buffer.from([0xd1]), Buffer.from('%PDF-1.4'), Buffer.from('PK\x03\x04'), Buffer.alloc(0), Buffer.from(' \n\t')]) {
    assert.throws(() => { const v = createTextMaterialValidator('text/plain'); v.write(bytes); v.finish(); }, (e) => ['INVALID_TEXT_MATERIAL', 'EMPTY_TEXT_MATERIAL'].includes(e.code));
  }
  const valid = createTextMaterialValidator('text/plain; charset=utf-8');
  const bytes = Buffer.from('я😀');
  for (const byte of bytes) valid.write(Uint8Array.of(byte));
  valid.finish();
});

test('justified non-obligation headings need no fabricated target but conditions still require coverage', () => {
  const registry = { groups: { FR: [{ id: 'FR-001', text: 'Система запрещает пересечения.' }] }, context: [] };
  const coverage = sourceCoverageFor('Аудит ReqAI 2026-10-15. Система запрещает пересечения.', registry);
  assert.equal(coverage.metadataUnits.length, 1);
  assert.deepEqual(coverage.units.map((unit) => unit.key), ['SOURCE-2']);
  const unknownHeading = sourceCoverageFor('Приветствие документа. Система запрещает пересечения.', registry);
  const checks = [ { key: 'SOURCE-1', disposition: 'non_obligation', reason: 'Дата и название аудита, без требований.', targetKeys: [], preservesConditions: true, issues: [] }, { key: 'SOURCE-2', targetKeys: ['FR-001'], preservesConditions: true, issues: [] } ];
  assert.ok(validateSourceCoverage({ sourceRevision: coverage.revision, sourceChecks: [checks[1]] }, coverage));
  assert.ok(validateSourceCoverage({ sourceRevision: unknownHeading.revision, sourceChecks: checks }, unknownHeading));
  for (const first of [{ ...checks[0], disposition: undefined }, { ...checks[0], reason: '' }, { ...checks[0], issues: ['lost condition'] }]) assert.throws(() => validateSourceCoverage({ sourceRevision: unknownHeading.revision, sourceChecks: [first, checks[1]] }, unknownHeading));
  assert.throws(() => validateSourceCoverage({ sourceRevision: unknownHeading.revision, sourceChecks: [checks[0], { ...checks[1], targetKeys: [] }] }, unknownHeading));
});

test('dated labels with any business condition remain obligations', () => {
  const registry = { groups: { FR: [] }, context: [] };
  for (const text of ['Аудит ReqAI 2026-10-15 требует проверки доступа.', '2026-10-15 — запуск обязателен.', 'Аудит ReqAI 2026-10-15: запрет платежей']) {
    const coverage = sourceCoverageFor(text, registry);
    assert.equal(coverage.units.length, 1);
    assert.equal(coverage.metadataUnits.length, 0);
    assert.throws(() => validateSourceCoverage({ sourceRevision: coverage.revision, sourceChecks: [] }, coverage));
  }
});

test('legacy material references are validated again before execution', async () => {
  const { ArtifactRepository } = await import('../src/repositories/artifact-repository.js');
  const repo = new ArtifactRepository({ connect() { throw new Error('metadata is stubbed'); } });
  let scope;
  repo.metadata = async (input) => { scope = input; return { content_type: 'text/plain' }; };
  repo.readChunks = async function* () { yield Buffer.from([0xd1]); };
  await assert.rejects(repo.validateMaterial({ tenantId: 't', ownerUserId: 'owner', artifactId: 'a' }), { code: 'INVALID_TEXT_MATERIAL' });
  assert.equal(scope.ownerUserId, 'owner');
  repo.metadata = async () => ({ content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  await assert.rejects(repo.validateMaterial({ tenantId: 't', artifactId: 'a' }), { code: 'UNSUPPORTED_MATERIAL_TYPE' });
  repo.metadata = async () => null;
  await assert.rejects(repo.validateMaterial({ tenantId: 't', artifactId: 'a' }), { code: 'ARTIFACT_NOT_FOUND' });
});
