// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ listJobs: vi.fn(), updateJobMetadata: vi.fn(), getJob: vi.fn() }));
vi.mock('./api/enterprise-api.js', () => ({ enterpriseApi: api }));
import HistoryDrawer from './HistoryDrawer.jsx';
import TaskTitle from './TaskTitle.jsx';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const job = { jobId: 'rooms', title: 'Переговорные', metadataRevision: 1, type: 'DECOMPOSITION', status: 'SUCCEEDED', createdAt: '2026-08-28' };

test('server search resets cursor, ignores late pages and opens an existing child job', async () => {
  let resolveOld;
  api.listJobs.mockResolvedValueOnce({ items: [job], nextCursor: 'old-page', indexingPending: true })
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ items: [{ ...job, title: 'Найдено в старой задаче', children: [{ ...job, jobId: 'child', type: 'RESEARCH' }] }], nextCursor: null });
  const select = vi.fn();
  render(<HistoryDrawer open onClose={vi.fn()} onSelect={select} />);
  await screen.findByText('Переговорные');
  expect(screen.getByText(/Поиск ещё обновляется/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'старая задача' } });
  await screen.findByText('Найдено в старой задаче');
  await act(() => resolveOld({ items: [{ ...job, jobId: 'late', title: 'Поздний ответ' }], nextCursor: null }));
  expect(screen.queryByText('Поздний ответ')).not.toBeInTheDocument();
  expect(api.listJobs).toHaveBeenLastCalledWith({ limit: 20, groupBy: 'workflow', q: 'старая задача' }, expect.any(Object));
  fireEvent.click(screen.getByText('Этапы задачи'));
  fireEvent.click(screen.getByRole('button', { name: /AI-исследование 1/ }));
  expect(select).toHaveBeenCalledWith('child');
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
