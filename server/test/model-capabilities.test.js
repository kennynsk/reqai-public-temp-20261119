import assert from 'node:assert/strict';
import test from 'node:test';
import { modelCapabilities, executionSettingsSnapshot } from '../src/domain/model-capabilities.js';
test('capabilities and immutable execution settings represent forced GLM reasoning accurately', () => {
  assert.deepEqual(modelCapabilities('glm-5.3-flash').reasoningLevels, ['low', 'high', 'max']);
  assert.equal(executionSettingsSnapshot({ model: 'glm-5.3-flash', reasoning: 'disabled', temperature: 0.2 }).effectiveReasoning, 'low');
  assert.equal(executionSettingsSnapshot({ model: 'glm-5.3-flash', reasoning: 'max' }).effectiveReasoning, 'max');
  assert.equal(executionSettingsSnapshot({ model: 'glm-4.7', reasoning: 'disabled' }).effectiveReasoning, 'disabled');
});
