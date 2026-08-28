import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  BABOK_OUTPUT_SCHEMA_VERSION,
  BABOK_REQUIREMENT_TYPES,
  createEmptyBabokRegistry,
  parseBabokOutput,
  validateBabokConsolidation,
} from '../src/services/babok-requirements-contract.js';
import { getOutputContract, outputContractIds } from '../src/prompts/output-contract-registry.js';

test('BABOK output contract defines all requirement and analysis registries', () => {
  const registry = createEmptyBabokRegistry();
  assert.equal(registry.schemaVersion, BABOK_OUTPUT_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(registry.groups), BABOK_REQUIREMENT_TYPES);
  assert.deepEqual(Object.keys(registry.analysis), ['GAP', 'HYP', 'TERM', 'traceability', 'delta', 'questions']);
  assert.deepEqual(registry.summary.counts, { BR: 0, SR: 0, FR: 0, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 0, HYP: 0, TERM: 0, DELTA: 0 });
  assert.equal(outputContractIds().includes('babok-requirements.v1'), true);
});

test('BABOK output contract parses only the versioned JSON envelope', () => {
  const registry = createEmptyBabokRegistry();
  assert.deepEqual(parseBabokOutput(JSON.stringify(registry)), registry);
  assert.deepEqual(getOutputContract('babok-requirements.v1').parse(JSON.stringify(registry)), registry);
  assert.throws(() => parseBabokOutput(JSON.stringify({ schemaVersion: 1, mode: 'DECOMPOSITION' })), /babok-requirements.v1/);
  assert.throws(() => parseBabokOutput('not-json'), (error) => error.type === 'OUTPUT_CONTRACT_VIOLATION');
});

test('golden BABOK fixture covers the complete registry shape', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  assert.deepEqual(parseBabokOutput(JSON.stringify(fixture)), fixture);
  assert.deepEqual(Object.keys(fixture.groups), BABOK_REQUIREMENT_TYPES);
  assert.equal(fixture.analysis.traceability.length, 2);
  assert.equal(fixture.analysis.delta.length, 1);
  assert.equal(fixture.materials.baseline.status, 'AVAILABLE');
});

function validRegistry() {
  const registry = createEmptyBabokRegistry({ outcome: 'COMPLETE' });
  registry.materials.primary = { artifactId: 'primary-1', role: 'primary', name: 'Источник', sha256: null, status: 'AVAILABLE' };
  registry.groups.BR = [{
    id: 'BR-001',
    text: 'Сократить срок обработки.',
    successIndicator: null,
    source: { artifactId: 'primary-1', locator: '§1', quote: 'Сократить срок обработки' },
    provenance: 'Извлечено',
    quality: 'Требует уточнения',
    relatedIds: ['SR-001'],
  }];
  registry.groups.SR = [{
    id: 'SR-001',
    role: 'Оператор',
    text: 'Оператору нужен наблюдаемый результат.',
    relatedTo: ['BR-001'],
    source: { artifactId: 'primary-1', locator: '§2', quote: 'Оператору нужен результат' },
    provenance: 'Нормализовано',
    quality: 'Готово',
  }];
  registry.groups.FR = [{
    id: 'FR-001',
    text: 'Решение предоставляет результат оператору.',
    relatedTo: ['SR-001'],
    source: { artifactId: 'primary-1', locator: '§3', quote: 'Предоставляет результат' },
    provenance: 'Нормализовано',
    quality: 'Готово',
  }];
  registry.analysis.GAP = [{
    id: 'GAP-001',
    kind: 'scope',
    text: 'Не определён показатель успеха.',
    affectedIds: ['BR-001'],
    nextStep: 'Уточнить у владельца бизнеса',
    source: null,
  }];
  registry.analysis.traceability = [{ from: 'BR-001', to: 'SR-001', relation: 'обосновывает', status: 'Подтверждено источником', source: null }];
  registry.analysis.questions = [{ id: 'QUESTION-001', gapId: 'GAP-001', priority: 'P0', addressee: 'Владелец бизнеса', text: 'Как измеряется успех?' }];
  registry.scope = { partial: false, units: [{ id: 'unit-1', artifactId: 'primary-1', status: 'COMPLETE', section: '§1–§3', note: null }] };
  registry.summary.counts = { BR: 1, SR: 1, FR: 1, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 1, HYP: 0, TERM: 0, DELTA: 0 };
  return registry;
}

test('BABOK validator enforces stable identifiers, references, evidence and counts', () => {
  const registry = validRegistry();
  assert.deepEqual(parseBabokOutput(JSON.stringify(registry)), registry);

  const duplicate = structuredClone(registry);
  duplicate.groups.FR[0].id = 'BR-001';
  assert.throws(() => parseBabokOutput(JSON.stringify(duplicate)), (error) => error.code === 'BABOK_OUTPUT_INVALID' && error.details.path.includes('groups.FR'));

  const brokenTraceability = structuredClone(registry);
  brokenTraceability.analysis.traceability[0].to = 'FR-999';
  assert.throws(() => parseBabokOutput(JSON.stringify(brokenTraceability)), /unknown record identifier/);

  const staleCounts = structuredClone(registry);
  staleCounts.summary.counts.FR = 0;
  assert.throws(() => parseBabokOutput(JSON.stringify(staleCounts)), /summary\.counts\.FR/);

  const unauthorizedEvidence = structuredClone(registry);
  unauthorizedEvidence.groups.FR[0].source.artifactId = 'foreign-artifact';
  assert.throws(() => parseBabokOutput(JSON.stringify(unauthorizedEvidence)), /not part of the authorized materials or execution scope/);
});

test('BABOK consolidation rules reject deltas without baseline and uncovered unavailable materials', () => {
  const delta = validRegistry();
  delta.analysis.delta = [{ id: 'DELTA-001', baselineId: null, newId: 'FR-001', kind: 'новое', comment: 'new', source: null }];
  delta.summary.counts.DELTA = 1;
  assert.throws(() => validateBabokConsolidation(delta), /delta is unavailable/);

  const unavailable = validRegistry();
  unavailable.materials.references = [{ artifactId: 'reference-1', role: 'reference', name: 'reference', sha256: null, status: 'UNAVAILABLE' }];
  assert.throws(() => validateBabokConsolidation(unavailable), /unavailable material/);

  const partial = validRegistry();
  partial.outcome = 'PARTIAL';
  partial.scope.partial = true;
  assert.throws(() => validateBabokConsolidation(partial, { failedChunks: ['chunk-2'] }), /failed execution unit/);
});

test('BABOK contract accepts insufficient context, partial scope and explicit material states', () => {
  const insufficient = createEmptyBabokRegistry();
  assert.doesNotThrow(() => parseBabokOutput(JSON.stringify(insufficient)));
  assert.doesNotThrow(() => validateBabokConsolidation(insufficient));

  const partial = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  partial.materials.primary = { artifactId: 'primary-1', role: 'primary', name: 'Источник', sha256: null, status: 'AVAILABLE' };
  partial.scope = { partial: true, units: [{ id: 'chunk-2', artifactId: 'chunk-2', status: 'FAILED', section: null, note: 'Не обработано' }] };
  assert.doesNotThrow(() => validateBabokConsolidation(partial, { failedChunks: ['chunk-2'] }));

  const missingBaseline = validRegistry();
  assert.equal(missingBaseline.materials.baseline.status, 'NOT_PROVIDED');
  assert.deepEqual(missingBaseline.analysis.delta, []);
  assert.doesNotThrow(() => validateBabokConsolidation(missingBaseline));

  const unavailableReference = validRegistry();
  unavailableReference.materials.references = [{ artifactId: 'reference-1', role: 'reference', name: 'reference', sha256: null, status: 'UNAVAILABLE' }];
  unavailableReference.analysis.GAP[0].text = 'Материал reference-1 недоступен для анализа.';
  assert.doesNotThrow(() => validateBabokConsolidation(unavailableReference));
});

test('BABOK context records may omit direct source evidence while requirements remain strict', () => {
  const registry = createEmptyBabokRegistry();
  registry.context = [{ id: 'CTX-001', kind: 'контекст', text: 'Общий контекст', source: null, provenance: 'Предложено — требует подтверждения', quality: 'Требует уточнения', relatedIds: [] }];
  registry.summary.counts.CTX = 1;
  assert.doesNotThrow(() => parseBabokOutput(JSON.stringify(registry)));

  const invalidRequirement = createEmptyBabokRegistry();
  invalidRequirement.groups.BR = [{ id: 'BR-001', text: 'Требование', successIndicator: null, source: null, provenance: 'Извлечено', quality: 'Готово', relatedIds: [] }];
  invalidRequirement.summary.counts.BR = 1;
  assert.throws(() => parseBabokOutput(JSON.stringify(invalidRequirement)), /expected an object/);
});
