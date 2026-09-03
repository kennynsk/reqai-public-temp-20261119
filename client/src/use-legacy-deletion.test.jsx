// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { useReviewState } from './review-state.js';
import { useLegacyDeletion } from './use-legacy-deletion.js';

test('legacy deletion confirms affected links, reserves IDs and undo preserves other edits', () => {
  const initial = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [{ id: 'FT-1', text: 'Действие', relatedTo: ['BT-1'] }], nonfunctional: [] };
  const { result } = renderHook(() => { const review = useReviewState(initial); return { review, deletion: useLegacyDeletion(review) }; });
  act(() => result.current.deletion.ask('business', 'BT-1'));
  expect(result.current.deletion.pending.affected).toEqual(['FT-1']);
  expect(result.current.review.content.business).toHaveLength(1);
  act(() => result.current.deletion.confirm());
  expect(result.current.review.content.business).toHaveLength(0);
  expect(result.current.review.content.functional[0].relatedTo).toEqual([]);
  expect(result.current.review.state.reservedIds).toContain('BT-1');
  act(() => result.current.review.setContent((value) => ({ ...value, functional: value.functional.map((record) => ({ ...record, text: 'Другая правка' })) })));
  act(() => result.current.deletion.undo());
  expect(result.current.review.content.business[0].text).toBe('Цель');
  expect(result.current.review.content.functional[0]).toMatchObject({ text: 'Другая правка', relatedTo: ['BT-1'] });
});

test('can dismiss a pending legacy deletion before confirming it', () => {
  const initial = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] };
  const { result } = renderHook(() => { const review = useReviewState(initial); return { review, deletion: useLegacyDeletion(review) }; });
  act(() => result.current.deletion.ask('business', 'BT-1'));
  expect(result.current.deletion.pending).toMatchObject({ type: 'business', id: 'BT-1', affected: [] });
  act(() => result.current.deletion.dismiss());
  expect(result.current.deletion.pending).toBeNull();
  expect(result.current.review.content.business).toHaveLength(1);
});
