// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ exportRequirementsVersion: vi.fn() }));
vi.mock('./api/enterprise-api.js', () => ({ enterpriseApi: mocks }));
import VersionExport from './VersionExport.jsx';
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
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
});
test('save-first exports only the returned saved version; download errors retain state', async () => {
  mocks.exportRequirementsVersion.mockRejectedValue(new Error('network'));
  const save = vi.fn().mockResolvedValue({ ...version, versionId: 'saved-v2' });
  render(<VersionExport version={version} isDirty={() => true} onSave={save} />);
  fireEvent.click(screen.getByText(/^Экспорт сохранённой версии ·/));
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
