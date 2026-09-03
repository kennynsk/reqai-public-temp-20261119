import { describe, expect, test } from 'vitest';
import { invalidateReviewEvidence, openReviewItems, updateReviewMetadata } from './review-metadata.js';

describe('review metadata', () => {
  test('creates a versioned review and preserves unrelated decisions', () => {
    const decisions = { BR: [{ id: 'BR-1' }], other: true };

    expect(updateReviewMetadata(decisions, { note: 'draft' })).toEqual({
      BR: [{ id: 'BR-1' }],
      other: true,
      review: { schemaVersion: 1, note: 'draft' },
    });
  });

  test('marks acknowledgement and completeness stale when gaps or omissions change', () => {
    const decisions = {
      review: {
        schemaVersion: 1,
        acknowledgment: { confirm: true, actor: 'user-1' },
        completeness: { check: true, recordedAt: '2026-08-30T10:00:00Z' },
      },
    };

    expect(updateReviewMetadata(decisions, { gaps: { 'GAP-1': { state: 'open' } } }).review).toEqual({
      schemaVersion: 1,
      gaps: { 'GAP-1': { state: 'open' } },
      acknowledgment: { confirm: false, actor: 'user-1', stale: true },
      completeness: { check: true, recordedAt: '2026-08-30T10:00:00Z' },
    });

    expect(updateReviewMetadata(decisions, { omissions: [{ id: 'OM-1' }] }).review).toEqual({
      schemaVersion: 1,
      omissions: [{ id: 'OM-1' }],
      acknowledgment: { confirm: false, actor: 'user-1', stale: true },
      completeness: { check: false, recordedAt: '2026-08-30T10:00:00Z', stale: true },
    });
  });

  test('invalidates only evidence that exists and is a no-op without a review', () => {
    const withoutReview = { BR: [] };
    expect(invalidateReviewEvidence(withoutReview)).toBe(withoutReview);

    const decisions = {
      review: {
        completeness: { check: true, owner: 'user-1' },
        acknowledgment: { confirm: true, owner: 'user-1' },
        note: 'keep me',
      },
    };
    expect(invalidateReviewEvidence(decisions)).toEqual({
      review: {
        completeness: { check: false, owner: 'user-1', stale: true },
        acknowledgment: { confirm: false, owner: 'user-1', stale: true },
        note: 'keep me',
      },
    });
  });

  test('lists open gaps, low-quality records, and manual omissions', () => {
    const content = {
      groups: {
        BR: [
          { id: 'BR-1', text: 'Готовое требование', quality: 'Готово' },
          { id: 'BR-2', text: 'Требует уточнения', quality: 'Требует уточнения' },
        ],
        FR: [{ id: 'FR-1', text: 'Конфликт', quality: 'Конфликтует' }],
      },
      analysis: {
        GAP: [
          { id: 'GAP-1', text: 'Открытый вопрос' },
          { id: 'GAP-2', text: 'Закрытый вопрос' },
        ],
      },
    };

    expect(openReviewItems(content, {
      gaps: { 'GAP-2': { state: 'closed' } },
      omissions: [
        { id: 'OM-1', text: 'Ручной пропуск', requirementIds: [] },
        { id: 'OM-2', text: 'Уже добавлен', requirementIds: ['FR-2'] },
      ],
    })).toEqual([
      { id: 'GAP-1', text: 'Открытый вопрос' },
      { id: 'BR-2', text: 'Требует уточнения · Требует уточнения' },
      { id: 'FR-1', text: 'Конфликт · Конфликтует' },
      { id: 'OM-1', text: 'Отмеченный пропуск: Ручной пропуск' },
    ]);
  });

  test('accepts the legacy flat content shape and defaults missing content', () => {
    expect(openReviewItems({
      BR: [{ id: 'BR-1', text: 'Не готово', quality: 'Не тестируемо' }],
      summary: 'not a group',
    })).toEqual([{ id: 'BR-1', text: 'Не готово · Не тестируемо' }]);
    expect(openReviewItems(null)).toEqual([]);
  });
});
