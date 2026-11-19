import assert from 'node:assert/strict';
import test from 'node:test';

import { readDecompositionResult } from '../src/services/decomposition-result-reader.js';
import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';

test('decomposition result reader preserves legacy and dispatches BABOK schemas independently', () => {
  const legacy = { schemaVersion: 1, mode: 'DECOMPOSITION', outcome: 'COMPLETE', decomposition: [], failedChunks: [] };
  assert.equal(readDecompositionResult(JSON.stringify(legacy)).kind, 'LEGACY');
  assert.equal(readDecompositionResult(JSON.stringify(createEmptyBabokRegistry())).kind, 'BABOK');
  assert.throws(() => readDecompositionResult(JSON.stringify({ schemaVersion: 1, mode: 'DECOMPOSITION' })), /Unsupported/);
});
