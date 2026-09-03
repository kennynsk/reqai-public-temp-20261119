// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ listJobs: vi.fn(), updateJobMetadata: vi.fn(), getJob: vi.fn() }));
vi.mock('./api/enterprise-api.js', () => ({ enterpriseApi: api }));
import HistoryDrawer from './HistoryDrawer.jsx';
import TaskTitle from './TaskTitle.jsx';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const job = { jobId: 'rooms', title: 'Переговорные', contextExcerpt: 'Организовать бронирование комнат без конфликтов и ручного согласования.', metadataRevision: 1, type: 'DECOMPOSITION', status: 'SUCCEEDED', createdAt: '2026-08-28' };

test('server search resets cursor, ignores late pages and opens an existing child job', async () => {
  let resolveOld;
  api.listJobs.mockResolvedValueOnce({ items: [job], nextCursor: 'old-page', indexingPending: true })
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ items: [{ ...job, title: 'Найдено в старой задаче', children: [{ ...job, jobId: 'child', type: 'RESEARCH' }] }], nextCursor: null });
  const select = vi.fn();
  render(<HistoryDrawer open onClose={vi.fn()} onSelect={select} />);
  await screen.findByText('Переговорные');
  expect(screen.getByText(/Организовать бронирование/)).toHaveClass('reqai-excerpt-clamp');
  expect(screen.getByText('Переговорные')).toHaveClass('reqai-title-clamp');
  expect(screen.getByText(/Поиск ещё обновляется/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'старая задача' } });
  await screen.findByText('Найдено в старой задаче');
  await act(() => resolveOld({ items: [{ ...job, jobId: 'late', title: 'Поздний ответ' }], nextCursor: null }));
  expect(screen.queryByText('Поздний ответ')).not.toBeInTheDocument();
  expect(api.listJobs).toHaveBeenLastCalledWith({ limit: 20, groupBy: 'workflow', q: 'старая задача' }, expect.any(Object));
  fireEvent.click(screen.getAllByText('Этапы задачи')[0]);
  fireEvent.click(screen.getByRole('button', { name: /AI-исследование 1/ }));
  expect(select).toHaveBeenCalledWith('child');
});

test('keeps accepted and queued statuses distinguishable in the filter', async () => {
  api.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  render(<HistoryDrawer open onClose={vi.fn()} onSelect={vi.fn()} />);

  const options = await screen.findAllByRole('option');
  expect(options.map((option) => option.textContent)).toEqual([
    'Любой',
    'Ожидает запуска',
    'В очереди',
    'Выполняется',
    'Повторяем этап',
    'Готово',
    'Не выполнено',
    'Отменяется',
    'Отменено',
  ]);
});

test('title conflict preserves draft and requires explicit comparison before retry', async () => {
  api.updateJobMetadata.mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce({ jobId: job.jobId, title: 'Мой заголовок', metadataRevision: 3 });
  api.getJob.mockResolvedValue({ ...job, title: 'Чужой заголовок', metadataRevision: 2 });
  const updated = vi.fn();
  render(<TaskTitle job={job} onUpdated={updated} />);
  const trigger = screen.getByRole('button', { name: 'Переименовать задачу' });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByRole('textbox', { name: 'Название задачи' }), { target: { value: 'Мой заголовок' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox')).toHaveValue('Мой заголовок');
  expect(updated).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить новое название для сравнения' }));
  await screen.findByText(/Сейчас на сервере: Чужой заголовок/);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));
  await waitFor(() => expect(updated).toHaveBeenCalled());
  expect(api.updateJobMetadata).toHaveBeenLastCalledWith('rooms', { title: 'Мой заголовок', expectedRevision: 2 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Переименовать задачу' })).toHaveFocus());
});

test('shows a recoverable loading error and then the empty state after retry', async () => {
  api.listJobs.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ items: [], nextCursor: null });
  const onClose = vi.fn();
  render(<HistoryDrawer open onClose={onClose} onSelect={vi.fn()} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Историю не удалось загрузить');
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  expect(await screen.findByText('Задачи не найдены. Измените поиск или фильтры.')).toBeInTheDocument();

  const first = screen.getByRole('button', { name: 'Закрыть' });
  first.focus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('combobox', { name: 'Статус' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Статус' }), { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});

test('renders fallback labels, partial outcomes, child stages, and saved versions', async () => {
  api.listJobs.mockResolvedValue({
    items: [
      { jobId: 'retired', mode: 'DECOMPOSITION_WITH_INSIGHTS', status: 'UNKNOWN', createdAt: '2026-08-28' },
      { jobId: 'insights', mode: 'REQUIREMENTS_INSIGHTS', status: 'CANCELLED', createdAt: '2026-08-28', contextExcerpt: 'Сводка исследования' },
      { jobId: 'research', type: 'RESEARCH', status: 'FAILED', createdAt: '2026-08-28', contextExcerpt: 'Исследование' },
      { jobId: 'partial', type: 'DECOMPOSITION', status: 'RUNNING', outcome: 'PARTIAL', createdAt: '2026-08-28', children: [{ jobId: 'child', status: 'SUCCEEDED' }], savedVersions: [{ versionId: 'v1', final: true, createdAt: '2026-08-28' }] },
      { jobId: 'saved', type: 'DECOMPOSITION', status: 'QUEUED', title: 'Сохранённая', savedVersions: [{ versionId: 'v2', final: false, createdAt: '2026-08-28' }] },
    ],
    nextCursor: null,
  });
  const onSelect = vi.fn();
  render(<HistoryDrawer open onClose={vi.fn()} onSelect={onSelect} activeJobId="child" />);

  expect(await screen.findByText('Архивная задача')).toBeInTheDocument();
  expect(screen.getByText('AI-исследование требований')).toBeInTheDocument();
  expect(screen.getAllByText('Исследование').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Подготовка требований')).toBeInTheDocument();
  expect(screen.getByText('Готово частично')).toBeInTheDocument();
  expect(screen.getByText('Статус уточняется')).toBeInTheDocument();

  fireEvent.click(screen.getAllByText('Этапы задачи')[0]);
  expect(screen.getByText(/Финальная версия сохранена/)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Исходная декомпозиция' })[0]);
  fireEvent.click(screen.getByRole('button', { name: /AI-исследование 1/ }));
  expect(onSelect).toHaveBeenCalledWith('partial');
  expect(onSelect).toHaveBeenCalledWith('child');

  fireEvent.click(screen.getAllByText('Этапы задачи')[1]);
  expect(screen.getByText(/Проверенная версия сохранена/)).toBeInTheDocument();
});

test('sends type and status filters to the server', async () => {
  api.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  render(<HistoryDrawer open onClose={vi.fn()} onSelect={vi.fn()} />);
  await screen.findByText('Задачи не найдены. Измените поиск или фильтры.');

  fireEvent.click(screen.getByRole('button', { name: 'Исследования' }));
  await waitFor(() => expect(api.listJobs).toHaveBeenLastCalledWith({ limit: 20, groupBy: 'workflow', type: 'RESEARCH' }, expect.any(Object)));
  fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), { target: { value: 'RUNNING' } });
  await waitFor(() => expect(api.listJobs).toHaveBeenLastCalledWith({ limit: 20, groupBy: 'workflow', type: 'RESEARCH', status: 'RUNNING' }, expect.any(Object)));
});

test('reports non-conflict title save and reload failures without losing the draft', async () => {
  api.updateJobMetadata.mockRejectedValueOnce(new Error('network'));
  api.getJob.mockRejectedValueOnce(new Error('reload failed'));
  render(<TaskTitle job={{ ...job, title: '' }} />);

  expect(screen.getByText('Подготовка требований')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Переименовать задачу' }));
  const input = screen.getByRole('textbox', { name: 'Название задачи' });
  fireEvent.change(input, { target: { value: 'Новый заголовок' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить название');
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить новое название для сравнения' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить название'));
  expect(screen.getByRole('textbox')).toHaveValue('Новый заголовок');
});

test('uses the default revision when an untitled job has no metadata revision', async () => {
  api.updateJobMetadata.mockResolvedValue({ jobId: 'untitled', title: 'Новая задача', metadataRevision: 1 });
  const updated = vi.fn();
  render(<TaskTitle job={{ jobId: 'untitled' }} onUpdated={updated} />);

  expect(screen.getByText('Подготовка требований')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Переименовать задачу' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Название задачи' }), { target: { value: 'Новая задача' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));

  await waitFor(() => expect(updated).toHaveBeenCalledOnce());
  expect(api.updateJobMetadata).toHaveBeenCalledWith('untitled', { title: 'Новая задача', expectedRevision: 0 });
});
