import { describe, expect, test } from 'vitest';
import {
  addBabokResearchRecord,
  babokManualCitation,
  babokRecordDetails,
  babokRegistryCounts,
  babokRegistryFrom,
  babokRegistryIds,
  cloneJson,
  collectRequirements,
  createBabokManualRecord,
  displayBabokEnhancementsForInsight,
  displayEnhancementsForInsight,
  finalBabokRegistry,
  failureMessage,
  formatDuration,
  formatElapsed,
  isBabokRegistry,
  jobIdFromPath,
  makeLegacyRecord,
  primaryStatus,
  removeBabokRecord,
  safeJson,
  stableBabokId,
  userFacingError,
  withBabokCounts,
} from './AsyncJobWorkspace.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';

function emptyRegistry() {
  const registry = roomBookingRegistry();
  return {
    ...registry,
    context: [],
    groups: Object.fromEntries(Object.keys(registry.groups).map((type) => [type, []])),
    analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [], questions: [] },
  };
}

describe('AsyncJobWorkspace compatibility helpers', () => {
  test('parses safe JSON and handles malformed or empty payloads', () => {
    expect(safeJson('{"ok":true}')).toEqual({ ok: true });
    expect(safeJson('{broken')).toBeNull();
    expect(safeJson('')).toBeNull();
  });

  test('maps primary statuses, errors and failure reasons to safe user-facing text', () => {
    expect(primaryStatus()).toBeNull();
    expect(primaryStatus({ outcome: 'PARTIAL' })).toMatchObject({ label: 'Готово частично' });
    expect(primaryStatus({ outcome: 'COMPLETE' })).toMatchObject({ label: 'Готово' });
    expect(primaryStatus({})).toMatchObject({ label: 'Статус неизвестен' });
    expect(primaryStatus({ status: 'UNKNOWN' })).toMatchObject({ label: 'Статус неизвестен' });
    expect(userFacingError({ code: 'USER_ACTIVE_JOB_LIMIT' })).toContain('Другая задача уже выполняется');
    expect(userFacingError({ status: 401 })).toContain('Нет доступа');
    expect(userFacingError({ status: 403 })).toContain('Нет доступа');
    expect(userFacingError({ status: 413 })).toContain('допустимый размер');
    expect(userFacingError({ code: 'REVIEW_GAP_ANSWERS_REQUIRED' })).toContain('Дополните ответ');
    expect(userFacingError({ code: 'REVIEW_GAP_CHECKLIST_REQUIRED' })).toContain('повторно проверьте');
    expect(userFacingError(new Error('network'))).toContain('Debug');
    expect(failureMessage({ reasonCode: 'NO_USABLE_OUTPUT' })).toContain('пригодный результат');
    expect(failureMessage({ reasonCode: 'OTHER' })).toBe('Попробуйте запустить задачу ещё раз.');
  });

  test('normalizes route ids and durations', () => {
    expect(jobIdFromPath('/tasks/a%2Fb/')).toBe('a/b');
    expect(jobIdFromPath('/')).toBeNull();
    expect(jobIdFromPath('/tasks/a/b')).toBeNull();
    expect(formatDuration()).toBe('—');
    expect(formatDuration(12)).toBe('12 мс');
    expect(formatDuration(1500)).toBe('2 с');
    expect(formatDuration(61_000)).toBe('1 мин 1 с');
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65_999)).toBe('01:05');
  });

  test('collects legacy requirement shapes from direct and decomposed payloads', () => {
    const value = {
      business: ['Цель'],
      functional: [{ id: 'FT-9', description: 'Описание' }, { text: '' }],
      nonfunctional: [42],
      decomposition: [
        { content: { business: [{ text: 'Вторая цель' }], functional: ['Функция'] } },
        { content: null },
      ],
    };
    expect(collectRequirements(value)).toEqual({
      business: [{ id: 'BT-1', text: 'Цель' }, { text: 'Вторая цель', id: 'BT-2' }],
      functional: [{ id: 'FT-9', description: 'Описание', text: 'Описание' }, { text: '', id: 'FT-2' }, { id: 'FT-3', text: 'Функция' }],
      nonfunctional: [{ id: 'NFT-1', text: '' }],
    });
    expect(collectRequirements(null)).toEqual({ business: [], functional: [], nonfunctional: [] });
  });

  test('recognizes BABOK registries and keeps their counts current', () => {
    const registry = roomBookingRegistry();
    expect(isBabokRegistry(registry)).toBe(true);
    expect(isBabokRegistry(null)).toBe(false);
    expect(isBabokRegistry({ ...registry, schemaVersion: 'old' })).toBe(false);
    expect(isBabokRegistry({ ...registry, groups: { ...registry.groups, FR: {} } })).toBe(false);
    expect(babokRegistryFrom({ baseRegistry: registry }, { registry: registry })).toBe(registry);
    expect(babokRegistryFrom(registry, {})).toBe(registry);
    expect(babokRegistryFrom({ baseRegistry: registry }, {})).toBe(registry);
    expect(babokRegistryFrom({ baseRegistry: null }, {})).toBeNull();
    expect(babokRegistryCounts(registry)).toEqual({ BR: 1, SR: 0, FR: 2, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 7, HYP: 0, TERM: 0, DELTA: 0 });
    expect(babokRegistryCounts({})).toEqual({ BR: 0, SR: 0, FR: 0, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 0, HYP: 0, TERM: 0, DELTA: 0 });
    expect(withBabokCounts({ ...registry, summary: null }).summary.counts).toEqual(babokRegistryCounts(registry));
  });

  test('generates stable ids and manual citations without reusing reserved ids', () => {
    expect(stableBabokId([{ id: 'FR-001' }, { id: 'FR-009' }], 'FR')).toBe('FR-010');
    expect(stableBabokId([{ id: 'FR-001' }], 'FR', ['FR-005'])).toBe('FR-006');
    expect(stableBabokId([{ id: 'FR-without-number' }], 'FR')).toBe('FR-001');
    expect(stableBabokId([{ id: 'OTHER' }], 'FR')).toBe('FR-001');
    expect(makeLegacyRecord('functional', 'Новая функция', [{ id: 'FT-2' }], ['FT-8'])).toEqual({ id: 'FT-9', text: 'Новая функция', fromResearch: false });
    expect(makeLegacyRecord('functional', 'Без номера', [{ id: 'FT-no-number' }])).toEqual({ id: 'FT-1', text: 'Без номера', fromResearch: false });
    expect(makeLegacyRecord('unknown', 'Текст', [])).toEqual({ id: 'REQ-1', text: 'Текст', fromResearch: false });
    expect(babokManualCitation('artifact', 'paragraph:2')).toEqual({ artifactId: 'artifact', locator: 'paragraph:2', quote: null });
    expect(babokManualCitation('artifact')).toMatchObject({ locator: 'manual-review' });
    expect(createBabokManualRecord('FR', 'FR-001', 'Без связанных записей', { sourceArtifactId: 'a', targetIds: null })).toMatchObject({ relatedTo: [] });
  });

  test.each([
    ['BR', { successIndicator: null, relatedIds: ['BR-1'] }],
    ['SR', { role: null, relatedTo: ['BR-1'] }],
    ['FR', { relatedTo: ['BR-1'] }],
    ['NFR', { category: 'Не указано', scope: null, relatedTo: ['BR-1'], verificationMethod: null }],
    ['TR', { completionCriterion: null, relatedTo: ['BR-1'] }],
    ['CON', { obligation: 'Соблюдать правило', scope: null, relatedTo: ['BR-1'] }],
  ])('creates the correct manual record shape for %s', (type, extra) => {
    const record = createBabokManualRecord(type, `${type}-001`, 'Соблюдать правило', { sourceArtifactId: 'a', fromResearch: true, researchEnhancementKey: 'i:0', targetIds: ['BR-1', null] });
    expect(record).toMatchObject({ id: `${type}-001`, text: 'Соблюдать правило', fromResearch: true, researchEnhancementKey: 'i:0', ...extra });
    expect(record.source.locator).toBe('research:i:0');
  });

  test('removes BABOK records and scrubs every relation type', () => {
    const registry = emptyRegistry();
    registry.context = [{ id: 'CTX-1', relatedIds: ['BR-1', 'CTX-2'] }];
    registry.groups.BR = [{ id: 'BR-1', text: 'Бизнес', relatedIds: ['FR-1', 'BR-1'] }];
    registry.groups.FR = [{ id: 'FR-1', text: 'Функция', relatedTo: ['BR-1'] }];
    registry.analysis.GAP = [{ id: 'GAP-1', affectedIds: ['BR-1', 'FR-1'] }];
    registry.analysis.HYP = [{ id: 'HYP-1', affectedIds: ['BR-1'] }];
    registry.analysis.TERM = [{ id: 'TERM-1', affectedIds: ['BR-1'] }];
    registry.analysis.traceability = [{ from: 'BR-1', to: 'FR-1' }, { from: 'FR-1', to: 'NFR-1' }];
    registry.analysis.delta = [{ baselineId: 'BR-1', newId: 'FR-1' }, { baselineId: 'NFR-1', newId: 'TR-1' }];
    registry.analysis.questions = [{ id: 'QUESTION-1', gapId: 'GAP-1' }, { id: 'QUESTION-2', gapId: 'GAP-2' }];

    const afterRequirement = removeBabokRecord(registry, 'BR', 'BR-1');
    expect(afterRequirement.groups.BR).toEqual([]);
    expect(afterRequirement.groups.FR[0].relatedTo).toEqual([]);
    expect(afterRequirement.context[0].relatedIds).toEqual(['CTX-2']);
    expect(afterRequirement.analysis.traceability).toEqual([{ from: 'FR-1', to: 'NFR-1' }]);
    expect(afterRequirement.analysis.delta).toEqual([{ baselineId: 'NFR-1', newId: 'TR-1' }]);
    expect(afterRequirement.analysis.GAP[0].affectedIds).toEqual(['FR-1']);

    expect(removeBabokRecord(registry, 'CTX', 'CTX-1').context).toEqual([]);
    expect(removeBabokRecord(registry, 'HYP', 'HYP-1').analysis.HYP).toEqual([]);
    expect(removeBabokRecord(registry, 'TERM', 'TERM-1').analysis.TERM).toEqual([]);
    expect(removeBabokRecord(registry, 'GAP', 'GAP-1').analysis.GAP).toEqual([]);
    expect(removeBabokRecord(registry, 'QUESTION', 'QUESTION-2').analysis.questions).toEqual([{ id: 'QUESTION-1', gapId: 'GAP-1' }]);

    const sparse = emptyRegistry();
    sparse.context = [{ id: 'CTX-1' }];
    sparse.groups.BR = [{ id: 'BR-1', text: 'Бизнес' }];
    sparse.analysis.HYP = [{ id: 'HYP-1' }];
    expect(removeBabokRecord(sparse, 'BR', 'BR-1').groups.BR).toEqual([]);
  });

  test('extracts structured detail labels for each BABOK type', () => {
    expect(babokRecordDetails('BR', { successIndicator: 'Метрика', relatedIds: ['FR-1'] })).toEqual([['Критерий успеха', 'Метрика'], ['Связанные записи', 'FR-1']]);
    expect(babokRecordDetails('SR', { role: 'Оператор' })).toEqual([['Роль', 'Оператор']]);
    expect(babokRecordDetails('NFR', { category: 'Скорость', scope: 'Сервис', verificationMethod: 'Тест' })).toHaveLength(3);
    expect(babokRecordDetails('NFR', { category: '', scope: '', verificationMethod: '' })).toEqual([]);
    expect(babokRecordDetails('TR', { completionCriterion: 'Обучение' })).toEqual([['Критерий завершения', 'Обучение']]);
    expect(babokRecordDetails('CON', { obligation: 'Норма', scope: 'Процесс' })).toEqual([['Обязательство', 'Норма'], ['Область', 'Процесс']]);
    expect(babokRecordDetails('CON', { obligation: '', scope: '' })).toEqual([]);
    expect(babokRecordDetails('FR', { relatedTo: ['BR-1'] })).toEqual([['Связанные записи', 'BR-1']]);
  });

  test('normalizes insight enhancement targets and historical fallbacks', () => {
    expect(displayEnhancementsForInsight({ category: 'patterns', enhancements: [{ targetType: 'business', text: '  Цель  ' }, { targetType: 'invalid', text: 'Функция' }, { text: '   ' }] })).toEqual([
      { targetType: 'business', text: 'Цель', sourceIndex: 0, targetIds: [] },
      { targetType: 'functional', text: 'Функция', sourceIndex: 1, targetIds: [] },
    ]);
    // Historical insights without structured enhancements stay informational:
    // their summary must not become an actionable requirement proposal.
    expect(displayEnhancementsForInsight({ category: 'risks', title: 'Риск', summary: 'Проверить' })).toEqual([]);
    expect(displayEnhancementsForInsight({ category: 'standards', title: '', summary: '' })).toEqual([]);
    expect(displayBabokEnhancementsForInsight({ category: 'patterns', enhancements: [{ targetType: 'FR', relatedTo: ['BR-1'], text: ' Функция ' }, { targetType: 'invalid', text: 'Нет' }, { targetType: 'NFR', text: '' }] })).toEqual([{ targetType: 'FR', relatedTo: ['BR-1'], sourceIndex: 0, targetIds: ['BR-1'], text: 'Функция' }]);
    expect(displayBabokEnhancementsForInsight({ category: 'risks', title: 'Риск', summary: 'Проверить' })).toEqual([]);
    expect(displayBabokEnhancementsForInsight({ category: 'standards', title: '', summary: '' })).toEqual([]);
    expect(displayBabokEnhancementsForInsight({ category: 'trends', title: 'Тренд', summary: 'Проверить' })).toEqual([]);
  });

  test('collects ids and applies accepted or rejected research enhancements', () => {
    const registry = roomBookingRegistry();
    expect(babokRegistryIds({})).toEqual(new Set());
    const ids = babokRegistryIds(registry);
    expect(ids).toEqual(expect.any(Set));
    expect(ids.has('BR-001')).toBe(true);
    expect(ids.has('GAP-001')).toBe(true);
    expect(ids.has('QUESTION-001')).toBe(true);
    expect(babokRegistryIds({ ...registry, context: undefined, analysis: {} })).toEqual(new Set(['BR-001', 'FR-001', 'FR-002']));

    const added = addBabokResearchRecord(registry, { targetType: 'FR', targetIds: ['BR-001', 'missing'], text: 'Новая функция' }, 'insight:0');
    expect(added.groups.FR.at(-1)).toMatchObject({ id: 'FR-003', text: 'Новая функция', fromResearch: true, researchEnhancementKey: 'insight:0', relatedTo: ['BR-001'] });
    const fallback = addBabokResearchRecord(registry, { targetType: 'unsupported', targetIds: ['BR-001'], text: 'Запасное требование' }, 'insight:1');
    expect(fallback.groups.FR.at(-1)).toMatchObject({ id: 'FR-003', researchEnhancementKey: 'insight:1' });

    const withResearch = { ...registry, groups: { ...registry.groups, FR: [...registry.groups.FR, { id: 'FR-099', text: 'Старое предложение', researchEnhancementKey: 'old' }] } };
    const enhancements = [
      { key: 'old', targetType: 'FR', text: 'Старое предложение' },
      { key: 'new', targetType: 'NFR', text: 'Новое качество' },
      { key: 'none', targetType: 'TR', text: 'Не выбрано' },
    ];
    const final = finalBabokRegistry(withResearch, enhancements, { old: 'rejected', new: 'accepted', none: 'rejected' });
    expect(final.groups.FR.some((item) => item.researchEnhancementKey === 'old')).toBe(false);
    expect(final.groups.NFR.at(-1)).toMatchObject({ researchEnhancementKey: 'new', text: 'Новое качество' });
    expect(final.groups.TR).toEqual([]);
    expect(finalBabokRegistry({}, enhancements, {})).toEqual({});
  });

  test('clones nested values without changing the original', () => {
    const original = { nested: { items: ['one'] } };
    const cloned = cloneJson(original);
    cloned.nested.items.push('two');
    expect(original.nested.items).toEqual(['one']);
    expect(cloneJson(null)).toBeNull();
    expect(cloneJson(undefined)).toBeUndefined();
  });
});
