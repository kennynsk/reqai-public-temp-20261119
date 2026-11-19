// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import RequirementTypeNav from './RequirementTypeNav.jsx';

let resize;
class ResizeObserverMock {
  constructor(callback) { resize = callback; }
  observe() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  delete globalThis.ResizeObserver;
  resize = null;
});

test('uses the labelled selector before type tabs overflow and restores the selection', () => {
  globalThis.ResizeObserver = ResizeObserverMock;
  const onSelect = vi.fn();
  const { container } = render(<RequirementTypeNav
    columns={[["BR", "Бизнес-требования"], ["SR", "Требования заинтересованных сторон"], ["FR", "Функциональные требования"]]}
    groups={{ BR: [{}], SR: [{}, {}], FR: [] }}
    activeType="BR"
    onSelect={onSelect}
  />);
  const host = container.firstElementChild;
  const tablist = host.querySelector('[role="tablist"]');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 320 });
  Object.defineProperty(tablist, 'scrollWidth', { configurable: true, value: 680 });
  act(() => resize());
  expect(host).toHaveAttribute('data-navigation-mode', 'select');
  const select = screen.getByRole('combobox', { name: 'Выбрать тип требований' });
  expect(select).toHaveValue('BR');
  fireEvent.change(select, { target: { value: 'SR' } });
  expect(onSelect).toHaveBeenCalledWith('SR');
});

test('keeps keyboard tabs when complete labels fit', () => {
  globalThis.ResizeObserver = ResizeObserverMock;
  const onSelect = vi.fn();
  const { container } = render(<RequirementTypeNav columns={[["BR", "Бизнес-требования"], ["FR", "Функциональные требования"]]} groups={{ BR: [{}], FR: [] }} activeType="BR" onSelect={onSelect} />);
  const host = container.firstElementChild;
  const tablist = host.querySelector('[role="tablist"]');
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 720 });
  Object.defineProperty(tablist, 'scrollWidth', { configurable: true, value: 440 });
  act(() => resize());
  expect(host).toHaveAttribute('data-navigation-mode', 'tabs');
  const first = screen.getByRole('tab', { name: 'BR · Бизнес-требования' });
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(onSelect).toHaveBeenCalledWith('FR');
  fireEvent.keyDown(first, { key: 'ArrowLeft' });
  fireEvent.keyDown(first, { key: 'Home' });
  fireEvent.keyDown(first, { key: 'End' });
  fireEvent.keyDown(first, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledWith('BR');
  expect(onSelect).toHaveBeenCalledWith('FR');
});

test('works without ResizeObserver and leaves unrelated keys alone', () => {
  const onSelect = vi.fn();
  render(<RequirementTypeNav columns={[["BR", "Бизнес-требования"]]} groups={{ BR: [] }} activeType="BR" onSelect={onSelect} />);
  const tab = screen.getByRole('tab', { name: 'BR · Бизнес-требования' });
  fireEvent.keyDown(tab, { key: 'PageDown' });
  expect(onSelect).not.toHaveBeenCalled();
});
