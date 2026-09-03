// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ exportRequirementsVersion: vi.fn() }));
vi.mock('./api/enterprise-api.js', () => ({ enterpriseApi: mocks }));
import VersionExport from './VersionExport.jsx';
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const version = { versionId: 'saved-v1', createdAt: '2026-08-28T12:00:00Z' };
test('export without a saved version never substitutes the model result', () => {
  render(<VersionExport isDirty={() => false} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Скачать Markdown' }));
  expect(screen.getByRole('status')).toHaveTextContent('сначала сохраните');
  expect(mocks.exportRequirementsVersion).not.toHaveBeenCalled();
});
test('dirty copy requires explicit previous-version choice and falls back to selectable text', async () => {
  mocks.exportRequirementsVersion.mockResolvedValue({ text: async () => '# Все требования' });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  render(<VersionExport version={version} isDirty={() => true} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Копировать Markdown' }));
  expect(mocks.exportRequirementsVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Экспортировать предыдущую версию' }));
  expect(await screen.findByRole('textbox', { name: 'Markdown для ручного копирования' })).toHaveValue('# Все требования');
  expect(mocks.exportRequirementsVersion).toHaveBeenCalledWith('saved-v1', 'markdown');
  expect(screen.getByRole('status')).not.toHaveTextContent('скопирован');
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Скопировать Markdown вручную' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Копировать Markdown' }));
  fireEvent.click(screen.getByRole('button', { name: 'Экспортировать предыдущую версию' }));
  expect(await screen.findByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
});
test('save-first exports only the returned saved version; download errors retain state', async () => {
  mocks.exportRequirementsVersion.mockRejectedValue(new Error('network'));
  const save = vi.fn().mockResolvedValue({ ...version, versionId: 'saved-v2' });
  render(<VersionExport version={version} isDirty={() => true} onSave={save} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Скачать DOCX' }));
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Экспорт при несохранённых изменениях' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Скачать DOCX' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  fireEvent.click(screen.getByRole('button', { name: 'Скачать DOCX' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и экспортировать' }));
  await waitFor(() => expect(mocks.exportRequirementsVersion).toHaveBeenCalledWith('saved-v2', 'docx'));
  expect(await screen.findByRole('status')).toHaveTextContent('Версия не изменена');
});
test('a prepared print link is not reused after another version is saved', async () => {
  mocks.exportRequirementsVersion.mockResolvedValue(new Blob(['<h1>Версия</h1>']));
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:saved-v1');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const result = render(<VersionExport version={version} isDirty={() => false} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Печать / PDF' }));
  expect(await screen.findByRole('link', { name: 'Открыть печатное представление' })).toHaveAttribute('href', 'blob:saved-v1');
  result.rerender(<VersionExport version={{ ...version, versionId: 'saved-v2' }} isDirty={() => false} />);
  expect(screen.queryByRole('link', { name: 'Открыть печатное представление' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('версия изменилась');
  result.unmount(); expect(revoke).toHaveBeenCalledWith('blob:saved-v1'); create.mockRestore(); revoke.mockRestore();
});

test('copies successfully and prepares a downloadable Markdown file', async () => {
  const blob = new Blob(['# Требования']);
  mocks.exportRequirementsVersion.mockResolvedValue(blob);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:markdown');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.useFakeTimers();
  render(<VersionExport version={version} isDirty={() => false} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Копировать Markdown' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  expect(writeText).toHaveBeenCalledWith('# Требования');
  expect(screen.getByRole('status')).toHaveTextContent('скопирован');

  fireEvent.click(screen.getByRole('button', { name: 'Скачать Markdown' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(create).toHaveBeenCalledWith(blob);
  expect(screen.getByRole('status')).toHaveTextContent('подготовлен к скачиванию');
  fireEvent.click(screen.getByRole('button', { name: 'Скачать DOCX' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(mocks.exportRequirementsVersion).toHaveBeenLastCalledWith('saved-v1', 'docx');
  vi.advanceTimersByTime(60_000);
  expect(revoke).toHaveBeenCalledWith('blob:markdown');
  create.mockRestore(); revoke.mockRestore();
});

test('does not export when the save-first callback returns no saved version', async () => {
  const save = vi.fn().mockResolvedValue(null);
  render(<VersionExport version={version} isDirty={() => true} onSave={save} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Скачать DOCX' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и экспортировать' }));

  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mocks.exportRequirementsVersion).not.toHaveBeenCalled();
});

test('keeps the export dialog open flow safe when saving the dirty draft fails', async () => {
  const save = vi.fn().mockRejectedValue(new Error('save failed'));
  render(<VersionExport version={version} isDirty={() => true} onSave={save} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
  fireEvent.click(screen.getByRole('button', { name: 'Скачать DOCX' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и экспортировать' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(await screen.findByRole('status')).toHaveTextContent('Сохранение не подтверждено');
});
