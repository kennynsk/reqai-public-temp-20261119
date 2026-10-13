// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ClarificationShell from './ClarificationShell.jsx';
import ReviewDialog from './ReviewDialog.jsx';
afterEach(cleanup);
test('confirmation above a question panel stays interactive and restores background isolation', () => {
  const save = vi.fn();
  const View = ({ confirm }) => <><button>Основной экран</button><ClarificationShell title="Уточнение GAP-004" onClose={() => {}}><button>Сохранить требования</button></ClarificationShell>{confirm && <ReviewDialog label="Подтвердить сохранение" onClose={() => {}}><button onClick={save}>Сохранить с вопросами</button></ReviewDialog>}</>;
  const view = render(<View confirm />);
  const button = screen.getByRole('button', { name: 'Сохранить с вопросами' });
  expect(button.closest('[inert]')).toBeNull();
  expect(screen.getByRole('button', { name: 'Сохранить требования' }).closest('[inert]')).not.toBeNull();
  fireEvent.click(button); expect(save).toHaveBeenCalledOnce();
  view.rerender(<View confirm={false} />);
  expect(screen.getByRole('button', { name: 'Сохранить требования' }).closest('[inert]')).toBeNull();
  view.unmount();
  expect(document.querySelector('[inert]')).toBeNull();
});
