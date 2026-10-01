// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReviewConflict from './ReviewConflict.jsx';
import { presentReviewChanges } from './review-conflict.js';

test('comparison describes review decisions without showing hashes and metadata paths in the primary content', () => {
  const changes = [
    { id: 'review.gaps.GAP-005.answer', operation: 'Решение проверки', local: '"Мой ответ"', remote: '"Ответ коллеги"' },
    { id: 'review.gapRequirements.GAP-005.FR-004.state', operation: 'Решение проверки', local: '"no-change"', remote: '"pending"' },
    { id: 'review.gapRequirements.GAP-005.FR-004.requirementHash', operation: 'Решение проверки', local: '"abc"', remote: '"def"' },
  ];
  expect(presentReviewChanges(changes)).toEqual([
    expect.objectContaining({ id: 'GAP-005', operation: 'Ответ', local: 'Мой ответ', remote: 'Ответ коллеги' }),
    expect.objectContaining({ id: 'GAP-005 · FR-004', local: 'Изменение не требуется', remote: 'Нужна проверка' }),
  ]);
  const apply = vi.fn();
  render(<ReviewConflict preview={{ changes, transferredProposalCount: 1 }} onApply={apply} />);
  expect(screen.getByRole('status')).toHaveTextContent('проверьте требования заново');
  expect(screen.getByText('Технические подробности решений').closest('details').open).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Перенести мои правки' }));
  expect(apply).toHaveBeenCalledWith(true);
});
