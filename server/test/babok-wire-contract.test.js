import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { BABOK_MODEL_JSON_SCHEMA, prepareBabokWireResponse } from '../src/skills/babok-wire-contract.js';
import { validateBabokRegistry } from '../src/services/babok-requirements-contract.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url)));

test('all registry types obey both the generated model schema and the editor contract', () => {
  const value = structuredClone(fixture);
  delete value.materials;
  delete value.scope;
  delete value.summary.counts;
  const validate = new Ajv({ strict: true, allErrors: true }).compile(BABOK_MODEL_JSON_SCHEMA);
  assert.ok(validate(value), JSON.stringify(validate.errors));
  assert.deepEqual(prepareBabokWireResponse(fixture), fixture);
  assert.doesNotThrow(() => validateBabokRegistry(prepareBabokWireResponse(fixture)));
});

test('transport normalization is lossless, idempotent and accepts extension fields', () => {
  const value = structuredClone(fixture);
  const records = [...value.context, ...Object.values(value.groups).flat()];
  for (const record of records) {
    record.quality = [record.quality];
    record.provenance = [record.provenance];
  }
  value.analysis.questions[0].priority = [value.analysis.questions[0].priority];
  value.analysis.traceability[0].status = [value.analysis.traceability[0].status];
  value.analysis.delta[0].kind = [value.analysis.delta[0].kind];
  value.extension = { text: 'Must survive' };
  const normalized = prepareBabokWireResponse(value);
  assert.deepEqual(normalized, { ...fixture, extension: value.extension });
  assert.deepEqual(prepareBabokWireResponse(normalized), normalized);
  assert.doesNotThrow(() => validateBabokRegistry(normalized));
});

test('every malformed record collection is rejected with contract diagnostics', () => {
  const paths = [ ['context'], ...Object.keys(fixture.groups).map((key) => ['groups', key]), ...Object.keys(fixture.analysis).map((key) => ['analysis', key]) ];
  let checked = 0;
  for (const path of paths) {
    for (const invalid of [null, false, 123, 'wrong', {}, [null], [false], ['wrong']]) {
      const value = structuredClone(fixture);
      const parent = path.length === 1 ? value : value[path[0]];
      parent[path.at(-1)] = invalid;
      assert.throws(() => prepareBabokWireResponse(value), (error) => error.type === 'OUTPUT_CONTRACT_VIOLATION' && error.details.issues.length > 0);
      checked++;
    }
  }
  assert.equal(checked, 104);
});

test('missing collections and ambiguous statuses are never fabricated', () => {
  const value = structuredClone(fixture);
  delete value.groups.SR;
  value.groups.FR[0].quality = ['Готово', 'Конфликтует'];
  value.groups.FR[0].text = '   ';
  assert.throws(() => prepareBabokWireResponse(value), (error) => {
    const paths = error.details.issues.map((issue) => issue.path);
    return ['$.groups.SR', '$.groups.FR[0].quality', '$.groups.FR[0].text'].every((path) => paths.includes(path));
  });
});
