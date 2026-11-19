import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResearchProposalAction as normalize } from '../src/domain/research-proposal-action.js';

const groups = { FR: [{ id: 'FR-001' }], SR: [{ id: 'SR-001' }] };
test('preserves explicit intent and does not infer replacement from historical links', () => {
  assert.deepEqual(normalize({ targetType: 'FR', targetIds: ['FR-001'] }, groups), {});
  assert.deepEqual(normalize({ operation: 'add', targetId: null, targetType: 'FR', targetIds: ['FR-001'] }, groups), { operation: 'add', targetId: null });
  assert.deepEqual(normalize({ operation: 'replace', targetId: 'FR-001', targetType: 'FR' }, groups), { operation: 'replace', targetId: 'FR-001' });
});
test('rejects malformed intent and foreign or mismatched replacement targets', () => {
  for (const value of [
    { operation: 'delete' }, { targetId: 'FR-001' },
    { operation: 'add', targetId: 'FR-001' },
    { operation: 'replace' }, { operation: 'replace', targetId: 'FR-999' },
    { operation: 'replace', targetId: 'SR-001' },
  ]) assert.throws(() => normalize({ targetType: 'FR', ...value }, groups), { type: 'INVALID_REQUIREMENTS_INSIGHTS' });
});

test('current prompt output must explicitly declare intent', () => {
  assert.throws(() => normalize({ targetType: 'FR', targetIds: ['FR-001'] }, groups, { required: true }), { type: 'INVALID_REQUIREMENTS_INSIGHTS' });
});
