// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import {
  buildBabokRequirementIndex,
  buildInsightPresentation,
  buildLegacyRequirementIndex,
  ensureSelectedInsightId,
  filterInsightPresentations,
  resolveRequirementPreview,
} from './research-review.js';
import { completeBabokResearchFixture, completeLegacyResearchFixture, missingTargetResearchFixture, sparseBabokResearchFixture, sparseLegacyResearchFixture } from './research-review.fixture.js';
import { roomBookingRegistry } from './room-booking.fixture.js';

const categoryMeta = {
  patterns: { label: 'Архитектурные паттерны', color: 'bg-violet-100 text-violet-700', active: 'bg-violet-600 text-white' },
  risks: { label: 'Риски', color: 'bg-orange-100 text-orange-700', active: 'bg-orange-600 text-white' },
};

describe('research review presentation helpers', () => {
  test('preserve complete fields and stable enhancement keys', () => {
    const raw = completeLegacyResearchFixture.insights[0];
    const presentation = buildInsightPresentation(raw, {
      categoryMeta,
      enhancements: raw.enhancements.map((enhancement, sourceIndex) => ({ ...enhancement, sourceIndex })),
    });

    expect(presentation).toMatchObject({
      id: 'legacy-complete',
      category: 'patterns',
      categoryKey: 'patterns',
      title: 'Уточнить сценарий обработки заявки',
      summary: 'Добавить явное состояние обработки.',
      detail: 'Пользователь должен видеть, что заявка принята и передана оператору.',
      applicability: 87,
      sourceTypes: ['case_study'],
      relatedTo: ['FT-001'],
      rationale: 'Снижает число повторных обращений.',
    });
    expect(presentation.citations).toHaveLength(1);
    expect(presentation.enhancements.map((item) => item.key)).toEqual(['legacy-complete:0', 'legacy-complete:1']);
    expect(presentation.enhancements[0].targetIds).toEqual(['FT-001']);
  });

  test('keeps sparse historical results readable and maps unknown categories to a neutral filter', () => {
    const presentation = buildInsightPresentation(sparseLegacyResearchFixture.insights[0], { categoryMeta });
    expect(presentation.categoryKey).toBe('unknown');
    expect(presentation.categoryLabel).toBe('Другие результаты');
    expect(presentation.title).toBe('Исторический результат');
    expect(presentation.detail).toBe('');
    expect(presentation.citations).toEqual([]);
    expect(filterInsightPresentations([presentation], 'unknown')).toEqual([presentation]);
    expect(ensureSelectedInsightId('missing', [presentation])).toBe('legacy-sparse');
  });

  test('keeps complete BABOK results and sparse historical BABOK results in the same view model', () => {
    const complete = completeBabokResearchFixture.insights[0];
    const presentation = buildInsightPresentation(complete, {
      categoryMeta,
      enhancements: complete.enhancements.map((enhancement, sourceIndex) => ({ ...enhancement, sourceIndex })),
    });
    expect(presentation).toMatchObject({
      id: 'babok-complete',
      category: 'risks',
      title: 'Одновременное бронирование',
      summary: 'Нужно явно описать конфликтующие запросы.',
      detail: 'Система должна атомарно отклонять второй запрос на тот же интервал.',
      applicability: 94,
      sourceTypes: ['open_standard', 'case_study'],
      relatedTo: ['BR-001', 'FR-001'],
      rationale: 'Защищает от двойного бронирования.',
    });
    expect(presentation.citations).toHaveLength(1);
    expect(presentation.enhancements.map((item) => item.key)).toEqual(['babok-complete:0', 'babok-complete:1']);

    const sparse = buildInsightPresentation(sparseBabokResearchFixture.insights[0], { categoryMeta });
    expect(sparse.categoryKey).toBe('unknown');
    expect(sparse.categoryLabel).toBe('Другие результаты');
    expect(sparse.detail).toBe('');
    expect(sparse.enhancements).toEqual([]);
  });

  test('indexes legacy requirements with exact wording and human-readable source', () => {
    const index = buildLegacyRequirementIndex({
      business: [{ id: 'BR-001', text: 'Цель', quality: 'Готово', source: { artifactId: 'brief', locator: 'абзац 1' }, relatedTo: ['FR-001'] }],
      functional: [{ id: 'FR-001', text: 'Система принимает заявку.', relatedTo: ['BR-001'] }],
      nonfunctional: [],
    }, { materials: { primary: { artifactId: 'brief', name: 'Бриф проекта' } } });
    expect(index.get('BR-001')).toMatchObject({ type: 'business', typeLabel: 'Бизнес-требование', text: 'Цель', quality: 'Готово', relationships: ['FR-001'], source: { label: 'Бриф проекта', locator: 'абзац 1' } });
    expect(resolveRequirementPreview(index, 'FR-999')).toEqual({ status: 'unavailable', id: 'FR-999' });
  });

  test('uses only the immutable BABOK input snapshot and never latest-version records', () => {
    const baseRegistry = roomBookingRegistry();
    const latestRegistry = roomBookingRegistry();
    latestRegistry.groups.FR[0].text = 'Текст из более новой редакции.';
    const index = buildBabokRequirementIndex(baseRegistry);

    expect(index.get('FR-001')).toMatchObject({ type: 'FR', typeLabel: 'Функциональное требование', text: 'Система запрещает пересекающиеся бронирования.', source: { label: 'Бриф переговорных', locator: 'Абзац 1' }, relationships: ['BR-001'] });
    expect(index.get('FR-001').text).not.toBe(latestRegistry.groups.FR[0].text);
    expect(index.get('BR-001').source.label).toBe('Бриф переговорных');
  });

  test('returns a typed unavailable state for missing historical targets', () => {
    const index = buildBabokRequirementIndex(completeBabokResearchFixture.baseRegistry);
    const related = missingTargetResearchFixture.insights[0].relatedTo[0];
    expect(resolveRequirementPreview(index, related)).toEqual({ status: 'unavailable', id: related });
  });
});
