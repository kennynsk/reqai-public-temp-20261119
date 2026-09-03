// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReviewDialog from './ReviewDialog.jsx';
afterEach(cleanup);
test('dialog traps focus including links, ignores closed details, and restores its trigger', () => {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const close = vi.fn();
  const result = render(<ReviewDialog label="Проверка" onClose={close}><button>Первый</button><details><summary>Скрытые поля</summary><input aria-label="Скрытое поле" /></details><a href="https://example.org">Источник</a></ReviewDialog>);
  const first = screen.getByRole('button', { name: 'Первый' });
  const last = screen.getByRole('link', { name: 'Источник' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Tab' }); expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  const dialog = screen.getByRole('dialog', { name: 'Проверка' });
  dialog.focus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
  result.unmount(); expect(trigger).toHaveFocus(); trigger.remove();
});

test('ignores hidden and negative-tab-index nodes and keeps focus inside an empty dialog', () => {
  const result = render(<ReviewDialog label="Пустой диалог" onClose={vi.fn()}><div hidden><button>Скрытая кнопка</button></div><button tabIndex={-1}>Недоступная кнопка</button></ReviewDialog>);
  const dialog = screen.getByRole('dialog', { name: 'Пустой диалог' });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(dialog).toHaveFocus();
  result.unmount();
});
