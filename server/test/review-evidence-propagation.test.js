import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewEvidenceChanges, invalidateReviewEvidence } from '../src/services/review-evidence.js';

function fixture() {
  const content = {
    groups: {
      BR: [{ id: 'BR-001', text: 'Увеличить регулярность накоплений.', successIndicator: null, relatedIds: [], source: { artifactId: 'source', locator: 'brief' }, quality: 'Требует уточнения' }],
      SR: [{ id: 'SR-003', text: 'Клиент приостанавливает сервис.', relatedTo: ['BR-001'] }, { id: 'SR-004', text: 'Клиент автоматически пополняет накопления.', relatedTo: ['BR-001'] }],
    },
    analysis: { GAP: [1, 2, 3, 4, 6, 7].map((number) => ({ id: `GAP-00${number}`, text: `Вопрос ${number}`, affectedIds: [number === 4 || number === 6 ? 'BR-001' : number === 7 ? 'SR-003' : 'SR-004'] })) },
  };
  const decisions = { review: {
    gaps: Object.fromEntries(content.analysis.GAP.map((gap) => [gap.id, { state: 'closed', closureKind: 'resolved', answer: 'Подтверждено', reason: 'Проверено' }])),
    gapRequirements: Object.fromEntries(content.analysis.GAP.map((gap) => [gap.id, { [gap.affectedIds[0]]: { state: 'no-change', reason: 'Уже отражено' } }])),
  } };
  return { content, decisions };
}

test('business metric-only refinement preserves operational closures but invalidates directly linked BR questions', () => {
  const { content, decisions } = fixture();
  const next = structuredClone(content);
  next.groups.BR[0].successIndicator = 'Не менее 30% клиентов к шестому месяцу.';
  next.groups.BR[0].quality = 'Готово';
  const changes = reviewEvidenceChanges(content, next);
  assert.deepEqual(changes.changedRecordIds, ['BR-001']);
  assert.deepEqual(changes.changedGapIds, ['GAP-004', 'GAP-006']);
  const result = invalidateReviewEvidence(decisions, changes);
  for (const id of ['GAP-001', 'GAP-002', 'GAP-003', 'GAP-007']) {
    assert.deepEqual(result.review.gaps[id], decisions.review.gaps[id]);
    assert.deepEqual(result.review.gapRequirements[id], decisions.review.gapRequirements[id]);
  }
  for (const id of ['GAP-004', 'GAP-006']) {
    assert.equal(result.review.gaps[id].state, 'answered');
    assert.equal(result.review.gaps[id].stale, true);
    assert.equal(result.review.gapRequirements[id]['BR-001'].state, 'pending');
  }
});

for (const [label, patch] of [
  ['text', { text: 'Изменённая цель сервиса.' }],
  ['source', { source: { artifactId: 'source', locator: 'different' } }],
  ['links', { relatedIds: ['SR-003'] }],
]) test(`business ${label} changes still invalidate indirect supporting questions`, () => {
  const { content, decisions } = fixture();
  const next = structuredClone(content);
  Object.assign(next.groups.BR[0], patch, { successIndicator: '30%' });
  const changes = reviewEvidenceChanges(content, next);
  assert.deepEqual(changes.changedGapIds, ['GAP-004', 'GAP-006']);
  assert.deepEqual([...changes.contextGapIds].sort(), ['GAP-001', 'GAP-002', 'GAP-003', 'GAP-007']);
  const result = invalidateReviewEvidence(decisions, changes);
  for (const gap of content.analysis.GAP) assert.equal(result.review.gaps[gap.id].state, 'answered');
  for (const id of ['GAP-001', 'GAP-002', 'GAP-003', 'GAP-007']) {
    const rid = content.analysis.GAP.find((gap) => gap.id === id).affectedIds[0];
    assert.equal(result.review.gapRequirements[id][rid].stale, true);
    assert.equal(result.review.gapRequirements[id][rid].state, 'no-change');
  }
});

test('removing a supporting BR still invalidates downstream questions', () => {
  const { content } = fixture();
  const next = structuredClone(content); next.groups.BR = [];
  const changes = reviewEvidenceChanges(content, next);
  assert.deepEqual(changes.changedGapIds, ['GAP-004', 'GAP-006']);
  assert.deepEqual([...changes.contextGapIds].sort(), ['GAP-001', 'GAP-002', 'GAP-003', 'GAP-007']);
});

test('context-only changes reopen questions but keep collected decisions for one-click reconfirmation', () => {
  const { content, decisions } = fixture();
  const next = structuredClone(content);
  next.groups.CON = [{ id: 'CON-001', text: 'Соблюдать 152-ФЗ.', relatedIds: [] }];
  const changes = reviewEvidenceChanges(content, next);
  assert.deepEqual(changes.changedRecordIds, ['CON-001']);
  assert.deepEqual(changes.changedGapIds, []);
  assert.deepEqual([...changes.contextGapIds].sort(), content.analysis.GAP.map((gap) => gap.id).sort());
  const result = invalidateReviewEvidence(decisions, changes);
  for (const gap of content.analysis.GAP) {
    assert.equal(result.review.gaps[gap.id].state, 'answered');
    assert.equal(result.review.gaps[gap.id].closureKind, null);
    assert.equal(result.review.gaps[gap.id].stale, true);
    assert.ok(result.review.gaps[gap.id].reason.startsWith('Изменился внешний контекст'), result.review.gaps[gap.id].reason);
    const entry = result.review.gapRequirements[gap.id][gap.affectedIds[0]];
    assert.equal(entry.state, 'no-change');
    assert.equal(entry.reason, 'Уже отражено');
    assert.equal(entry.stale, true);
  }
});

test('a directly edited requirement resets its own check but keeps sibling decisions marked stale', () => {
  const { content, decisions } = fixture();
  content.analysis.GAP[0].affectedIds = ['SR-004', 'SR-003'];
  decisions.review.gapRequirements['GAP-001'] = { 'SR-004': { state: 'no-change', reason: 'Уже отражено' }, 'SR-003': { state: 'no-change', reason: 'Не менялось' } };
  const next = structuredClone(content);
  next.groups.SR[1].text = 'Клиент пополняет накопления в приложении.';
  const changes = reviewEvidenceChanges(content, next);
  assert.deepEqual(changes.changedRecordIds, ['SR-004']);
  assert.deepEqual(changes.changedGapIds, ['GAP-001', 'GAP-002', 'GAP-003']);
  const result = invalidateReviewEvidence(decisions, changes);
  assert.equal(result.review.gapRequirements['GAP-001']['SR-004'].state, 'pending');
  assert.equal(result.review.gapRequirements['GAP-001']['SR-003'].state, 'no-change');
  assert.equal(result.review.gapRequirements['GAP-001']['SR-003'].stale, true);
  assert.equal(result.review.gaps['GAP-001'].reason.startsWith('Нужна повторная проверка'), true);
});
