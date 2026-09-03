import { describe, expect, test } from 'vitest';
import { applyProposal, nextProposalId, proposalRecord, proposalWarnings, reverseProposal } from './proposal-review.js';

const types = ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON'];
const baseRecord = (type) => ({
  id: `${type}-001`,
  text: `Исходное требование ${type}`,
  quality: 'Готово',
  source: { artifactId: 'primary', locator: 'paragraph:1' },
  ...(type === 'BR' ? { relatedIds: [] } : { relatedTo: type === 'SR' ? [] : ['BR-001'] }),
  ...(type === 'NFR' ? { category: 'Производительность', scope: 'Все офисы', verificationMethod: 'Нагрузочный тест' } : {}),
  ...(type === 'CON' ? { obligation: 'Обязательно', scope: 'Все офисы' } : {}),
});

function state() {
  const groups = Object.fromEntries(types.map((type) => [type, [baseRecord(type)]]));
  return {
    content: {
      groups,
      context: [],
      analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [] },
      materials: { primary: { artifactId: 'primary' } },
      summary: { counts: Object.fromEntries(types.map((type) => [type, 1])) },
    },
    decisions: { acceptedEnhancementKeys: [], rejectedEnhancementKeys: [], review: { schemaVersion: 1 } },
    reservedIds: [],
  };
}

const fields = {
  BR: { successIndicator: 'Снижение конфликтов' },
  SR: { role: 'Администратор' },
  FR: {},
  NFR: { category: 'Надёжность', scope: 'Все офисы', verificationMethod: 'Тест отказоустойчивости' },
  TR: { completionCriterion: 'Миграция завершена' },
  CON: { obligation: 'Обязательно', scope: 'Все офисы' },
};

describe.each(types)('proposal lifecycle for %s', (targetType) => {
  test('accepts edited wording, survives reload and reverses without duplicates', () => {
    const enhancement = { key: `insight:${targetType}`, targetType, targetIds: ['BR-001'], text: `Предложение ${targetType}` };
    const accepted = applyProposal(state(), enhancement, { operation: 'add', targetType, targetId: '', text: `Проверенная формулировка ${targetType}`, fields: fields[targetType] });
    const reloaded = JSON.parse(JSON.stringify(accepted));
    const record = reloaded.content.groups[targetType].find((item) => item.researchEnhancementKey === enhancement.key);

    expect(record).toMatchObject({ text: `Проверенная формулировка ${targetType}`, fromResearch: true });
    expect(reloaded.decisions.acceptedEnhancementKeys).toEqual([enhancement.key]);
    expect(reloaded.decisions.review.proposals[enhancement.key].decision).toBe('accepted');

    const reapplied = applyProposal(reloaded, enhancement, { operation: 'add', targetType, targetId: '', text: `Проверенная формулировка ${targetType}`, fields: record });
    expect(reapplied.content.groups[targetType].filter((item) => item.researchEnhancementKey === enhancement.key)).toHaveLength(1);

    const rejected = reverseProposal(reapplied, enhancement.key, false);
    expect(rejected.content.groups[targetType].some((item) => item.researchEnhancementKey === enhancement.key)).toBe(false);
    expect(rejected.decisions.rejectedEnhancementKeys).toContain(enhancement.key);
  });
});

test('reversing a manually refined accepted proposal can retain it without AI lineage', () => {
  const enhancement = { key: 'insight:manual', targetType: 'FR', text: 'Черновая формулировка' };
  const accepted = applyProposal(state(), enhancement, { operation: 'add', targetType: 'FR', targetId: '', text: 'Финальная ручная формулировка', fields: {} });
  const retained = reverseProposal(accepted, enhancement.key, true);
  const record = retained.content.groups.FR.find((item) => item.text === 'Финальная ручная формулировка');
  expect(record).toMatchObject({ fromResearch: false, manuallyEdited: true });
  expect(record).not.toHaveProperty('researchEnhancementKey');
});

test('mixed-language and instruction-like proposal text stays visible and is warned about', () => {
  expect(proposalWarnings('Предложить уточнить каналы协作')).toEqual([
    'В тексте есть фрагмент на другом языке. Проверьте формулировку.',
    'Это может быть инструкция аналитику, а не проверяемое требование.',
  ]);
  expect(proposalWarnings('Обычный текст требования')).toEqual([]);
});

test('supports legacy flat content and reserves the next ID for each public type', () => {
  expect(nextProposalId({ content: { business: [{ id: 'BT-2' }], functional: [], nonfunctional: [] }, reservedIds: ['BT-8'] }, 'business')).toBe('BT-9');
  expect(nextProposalId({ content: { groups: { NFR: [{ id: 'NFR-007' }] } }, reservedIds: ['NFR-009'] }, 'NFR')).toBe('NFR-010');
  expect(nextProposalId({ content: { groups: { FR: [{ id: 'FR-001' }] } } }, 'FR')).toBe('FR-002');
  expect(nextProposalId({ content: { groups: { BR: [], SR: [], FR: [] } }, reservedIds: [] }, 'custom')).toBe('custom-001');

  const legacy = { business: [{ id: 'BT-1', text: 'Старая цель' }] };
  expect(proposalRecord(legacy, 'business', 'BT-2', 'Новая цель', {}, 'legacy:key')).toEqual({
    id: 'BT-2', text: 'Новая цель', fromResearch: true, researchEnhancementKey: 'legacy:key',
  });

  expect(proposalRecord(state().content, 'NFR', 'NFR-002', 'Надёжное требование', { category: '', scope: '', verificationMethod: '' }, 'sparse:key')).toMatchObject({
    category: '', scope: null, verificationMethod: null,
  });
});

test('rejects stale replacement plans and conflicting proposal lineage', () => {
  expect(() => applyProposal(state(), { key: 'missing', text: 'Новое' }, { operation: 'replace', targetType: 'FR', targetId: 'FR-404', text: 'Новое', fields: {} })).toThrow('больше не существует');

  const conflict = state();
  conflict.content.groups.FR[0].researchEnhancementKey = 'other:key';
  expect(() => applyProposal(conflict, { key: 'new:key', text: 'Новое' }, { operation: 'replace', targetType: 'FR', targetId: 'FR-001', text: 'Новое', fields: {} })).toThrow('другим AI-предложением');

  const enhancement = { key: 'insight:stale', targetType: 'FR', text: 'Новое' };
  const accepted = applyProposal(state(), enhancement, { operation: 'add', targetType: 'FR', targetId: '', text: 'Новое', fields: {} });
  expect(() => applyProposal(accepted, enhancement, { operation: 'add', targetType: 'BR', targetId: '', text: 'Новое', fields: {} })).toThrow('изменить тип или цель');
  expect(() => applyProposal(accepted, enhancement, { operation: 'replace', targetType: 'FR', targetId: 'FR-001', text: 'Новое', fields: {} })).toThrow('изменить тип или цель');
});

test('reversing an added proposal restores links, traceability, delta, and rejection state', () => {
  const enhancement = { key: 'insight:remove', targetType: 'FR', text: 'Удаляемое требование' };
  const accepted = applyProposal(state(), enhancement, { operation: 'add', targetType: 'FR', targetId: '', text: 'Удаляемое требование', fields: {} });
  const id = accepted.decisions.review.proposals[enhancement.key].targetId;
  accepted.content.context = [{ id: 'CTX-1', relatedIds: [id] }];
  accepted.content.analysis.GAP = [{ id: 'GAP-1', affectedIds: [id] }];
  accepted.content.analysis.traceability = [{ from: id, to: 'BR-001' }, { from: 'BR-001', to: 'FR-001' }];
  accepted.content.analysis.delta = [{ id: 'DELTA-1', newId: id }, { id: 'DELTA-2', newId: 'FR-001' }];

  const reversed = reverseProposal(accepted, enhancement.key, false);
  expect(reversed.content.groups.FR.some((record) => record.id === id)).toBe(false);
  expect(reversed.content.context[0].relatedIds).toEqual([]);
  expect(reversed.content.analysis.GAP[0].affectedIds).toEqual([]);
  expect(reversed.content.analysis.traceability).toEqual([{ from: 'BR-001', to: 'FR-001' }]);
  expect(reversed.content.analysis.delta).toEqual([{ id: 'DELTA-2', newId: 'FR-001' }]);
  expect(reversed.decisions.rejectedEnhancementKeys).toContain(enhancement.key);
});
