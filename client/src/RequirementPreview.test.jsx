// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { buildBabokRequirementIndex, createRequirementIndex } from './research-review.js';
import { roomBookingRegistry } from './room-booking.fixture.js';
import { RequirementPreviewLink, RequirementPreviewProvider } from './RequirementPreview.jsx';

afterEach(() => {
  cleanup();
  window.innerWidth = 1024;
});

function renderPreview() {
  const index = buildBabokRequirementIndex(roomBookingRegistry());
  return render(<RequirementPreviewProvider index={index}>
    <div>
      <RequirementPreviewLink id="FR-001" />
      <RequirementPreviewLink id="FR-404" />
      <button type="button">Внешняя область</button>
    </div>
  </RequirementPreviewProvider>);
}

test('opens one non-navigating desktop preview with snapshot content and switches in place', async () => {
  renderPreview();
  const trigger = screen.getByRole('button', { name: 'FR-001' });
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200, right: 164, bottom: 228, width: 64, height: 28 });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: /Функциональное требование · FR-001/ });

  expect(dialog).toHaveTextContent('Система запрещает пересекающиеся бронирования.');
  expect(dialog).toHaveTextContent('Качество: Готово');
  expect(dialog).toHaveTextContent('Бриф переговорных · paragraph:1');
  expect(dialog).toHaveTextContent('Связи');
  expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(trigger).not.toHaveAttribute('href');

  const nestedTrigger = within(dialog).getByRole('button', { name: 'BR-001' });
  vi.spyOn(nestedTrigger, 'getBoundingClientRect').mockReturnValue({ left: 140, top: 300, right: 204, bottom: 328, width: 64, height: 28 });
  fireEvent.click(nestedTrigger);
  expect(screen.getByRole('dialog', { name: /Бизнес-требование · BR-001/ })).toBe(dialog);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(dialog).toHaveTextContent('Сократить конфликты бронирования.');
  expect(dialog).toHaveStyle({ left: '100px', top: '240px' });
  expect(within(dialog).getByRole('button', { name: 'Закрыть предпросмотр требования' })).toHaveFocus();
});

test('keeps the original desktop anchor through repeated nested transitions', async () => {
  const index = createRequirementIndex([
    { id: 'FR-001', type: 'FR', typeLabel: 'Функциональное требование', text: 'Первое требование.', quality: 'Готово', source: null, relationships: ['BR-001'] },
    { id: 'BR-001', type: 'BR', typeLabel: 'Бизнес-требование', text: 'Связанное требование.', quality: 'Готово', source: null, relationships: ['FR-001'] },
  ]);
  render(<RequirementPreviewProvider index={index}><RequirementPreviewLink id="FR-001" /></RequirementPreviewProvider>);

  const rootTrigger = screen.getByRole('button', { name: 'FR-001' });
  vi.spyOn(rootTrigger, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 200, right: 164, bottom: 228, width: 64, height: 28 });
  fireEvent.click(rootTrigger);
  const dialog = await screen.findByRole('dialog', { name: /Функциональное требование · FR-001/ });

  const firstNestedTrigger = within(dialog).getByRole('button', { name: 'BR-001' });
  vi.spyOn(firstNestedTrigger, 'getBoundingClientRect').mockReturnValue({ left: 760, top: 700, right: 824, bottom: 728, width: 64, height: 28 });
  fireEvent.click(firstNestedTrigger);
  expect(dialog).toHaveStyle({ left: '100px', top: '240px' });

  const secondNestedTrigger = within(dialog).getByRole('button', { name: 'FR-001' });
  vi.spyOn(secondNestedTrigger, 'getBoundingClientRect').mockReturnValue({ left: 860, top: 700, right: 924, bottom: 728, width: 64, height: 28 });
  fireEvent.click(secondNestedTrigger);
  expect(screen.getByRole('dialog', { name: /Функциональное требование · FR-001/ })).toBe(dialog);
  expect(dialog).toHaveStyle({ left: '100px', top: '240px' });
});

test('shows missing records, dismisses outside or with Escape and restores trigger focus', async () => {
  renderPreview();
  const missing = screen.getByRole('button', { name: 'FR-404' });
  fireEvent.click(missing);
  const dialog = await screen.findByRole('dialog', { name: /Запись требования · FR-404/ });
  expect(dialog).toHaveTextContent('Запись недоступна');
  expect(dialog).toHaveTextContent('FR-404');
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(missing).toHaveFocus();

  const existing = screen.getByRole('button', { name: 'FR-001' });
  fireEvent.click(existing);
  await screen.findByRole('dialog');
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Внешняя область' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(existing).toHaveFocus();
});

test('uses the same preview surface as a bottom sheet at a narrow effective width', async () => {
  window.innerWidth = 390;
  renderPreview();
  fireEvent.click(screen.getByRole('button', { name: 'FR-001' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.className).toContain('bottom-3');
  expect(dialog.className).toContain('inset-x-3');
  expect(dialog).toHaveTextContent('Система запрещает пересекающиеся бронирования.');
});
