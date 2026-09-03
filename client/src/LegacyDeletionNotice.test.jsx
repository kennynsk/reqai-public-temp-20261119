// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import LegacyDeletionNotice from './LegacyDeletionNotice.jsx';

afterEach(cleanup);

test('confirms or dismisses a pending deletion and explains empty relations', () => {
  const dismiss = vi.fn();
  const confirm = vi.fn();
  render(<LegacyDeletionNotice deletion={{ pending: { id: 'BT-1', affected: [] }, dismiss, confirm }} />);

  expect(screen.getByRole('dialog', { name: 'Удаление требования' })).toBeInTheDocument();
  expect(screen.getByText(/Затронутые связи: нет\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Не удалять' }));
  expect(dismiss).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
  expect(confirm).toHaveBeenCalledOnce();
});

test('offers undo after a deletion', () => {
  const undo = vi.fn();
  render(<LegacyDeletionNotice deletion={{ pending: null, last: { id: 'BT-2' }, undo }} />);

  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Удалено BT-2.');
  fireEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }));
  expect(undo).toHaveBeenCalledOnce();
});
