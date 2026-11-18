// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(), getJob: vi.fn(), getResult: vi.fn(), getResultContent: vi.fn(), getCapabilities: vi.fn(), decomposeRequirements: vi.fn(),
  uploadArtifact: vi.fn(), createJob: vi.fn(), researchRequirements: vi.fn(), cancelJob: vi.fn(), downloadArtifact: vi.fn(), getJobTrace: vi.fn(), getJobTraceDetail: vi.fn(),
  listRequirementsVersions: vi.fn(), getRequirementsVersion: vi.fn(), saveRequirementsVersion: vi.fn(), subscribe: vi.fn(),
}));

vi.mock('./api/enterprise-api.js', () => ({
  enterpriseApi: {
    listJobs: mocks.listJobs, getJob: mocks.getJob, getResult: mocks.getResult, getResultContent: mocks.getResultContent,
    getCapabilities: mocks.getCapabilities, uploadArtifact: mocks.uploadArtifact, createJob: mocks.createJob,
    decomposeRequirements: mocks.decomposeRequirements,
    researchRequirements: mocks.researchRequirements,
    cancelJob: mocks.cancelJob, downloadArtifact: mocks.downloadArtifact, listRequirementsVersions: mocks.listRequirementsVersions,
    getRequirementsVersion: mocks.getRequirementsVersion, saveRequirementsVersion: mocks.saveRequirementsVersion,
    getJobTrace: mocks.getJobTrace, getJobTraceDetail: mocks.getJobTraceDetail,
  },
  subscribeJobEvents: mocks.subscribe,
}));

import AsyncJobWorkspace from './AsyncJobWorkspace.jsx';
import { roomBookingBrief, roomBookingRegistry } from './room-booking.fixture.js';
import { createEmptyBabokRegistry } from '../../server/src/services/babok-requirements-contract.js';
import { createBabokTextDraft } from '../../server/src/services/babok-text-draft.js';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
} });

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  mocks.listRequirementsVersions.mockResolvedValue({ items: [] });
  mocks.getCapabilities.mockResolvedValue({ capabilities: { models: ['GC-Max', 'GC-M', 'GC-Lite'], domainOperations: ['decomposition', 'requirements-research'] } });
  mocks.getJobTrace.mockResolvedValue({ jobId: 'job', status: 'RUNNING', createdAt: new Date().toISOString(), durationMs: null, timeline: [], nextCursor: null });
  mocks.subscribe.mockResolvedValue();
});
afterEach(cleanup);

test('context remains free-form and keeps an accessible attachment control', async () => {
  render(<AsyncJobWorkspace />);
  const context = screen.getByRole('textbox', { name: 'Бизнес-контекст' });
  expect(context).toHaveClass('reqai-control');
  expect(screen.queryByRole('button', { name: 'Свернуть форму бизнес-задачи' })).not.toBeInTheDocument();
  fireEvent.change(context, { target: { value: 'Моя бизнес-задача' } });
  expect(context).toHaveValue('Моя бизнес-задача');
  expect(context).toHaveAttribute('rows', '6');
  expect(screen.getByRole('button', { name: 'Свернуть форму бизнес-задачи' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Структура описания' })).not.toBeInTheDocument();
  expect(screen.getByText('Приложить материалы')).toBeInTheDocument();
  expect(screen.getByLabelText('Файл требований')).toBeInTheDocument();
});

test('material roles use integration API and retry only failed file uploads', async () => {
  mocks.getCapabilities.mockResolvedValue({ capabilities: { models: ['glm-5.3-flash'], domainOperations: ['decomposition'] } });
  const primary = new File(['Primary'], 'primary.txt', { type: 'text/plain' });
  const baseline = new File(['Baseline'], 'baseline.txt', { type: 'text/plain' });
  const reference = new File(['Reference'], 'reference.txt', { type: 'text/plain' });
  let referenceAttempts = 0;
  mocks.uploadArtifact.mockImplementation(async (file) => {
    if (file === reference && ++referenceAttempts === 1) throw new Error('Network');
    return { artifactId: file.name };
  });
  mocks.decomposeRequirements.mockResolvedValue({ jobId: 'material-job' });
  mocks.getJob.mockResolvedValue({ jobId: 'material-job', type: 'DECOMPOSITION', status: 'RUNNING' });
  render(<AsyncJobWorkspace />);
  fireEvent.click(screen.getByText('Приложить материалы'));
  fireEvent.change(await screen.findByLabelText('Предыдущая версия требований'), { target: { files: [baseline] } });
  fireEvent.change(screen.getByLabelText('Файл требований'), { target: { files: [primary] } });
  fireEvent.change(screen.getByLabelText('Справочные материалы'), { target: { files: [reference] } });
  fireEvent.click(screen.getByRole('button', { name: 'Декомпозировать требования' }));
  await screen.findByText(/Не все материалы загружены/);
  expect(mocks.decomposeRequirements).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Декомпозировать требования' }));
  await waitFor(() => expect(mocks.decomposeRequirements).toHaveBeenCalledWith({ inputArtifactId: 'primary.txt', baselineArtifactId: 'baseline.txt', referenceArtifactIds: ['reference.txt'], model: 'glm-5.3-flash', reasoning: 'low', temperature: 0.2, criticEnabled: true }));
  expect(mocks.uploadArtifact.mock.calls.filter(([file]) => file === primary)).toHaveLength(1);
  expect(mocks.uploadArtifact.mock.calls.filter(([file]) => file === baseline)).toHaveLength(1);
  expect(mocks.uploadArtifact.mock.calls.filter(([file]) => file === reference)).toHaveLength(2);
});

test('next-run settings restore per actor and old disabled migrates to low for GLM', async () => {
  localStorage.setItem('reqai.nextAiSettings:["tenant","user"]', JSON.stringify({ model: 'glm-5.3-flash', reasoning: 'disabled', temperature: 0.7 }));
  mocks.getCapabilities.mockResolvedValue({ tenantId: 'tenant', userId: 'user', capabilities: { models: ['glm-4.7', 'glm-5.3-flash'] } });
  const first = render(<AsyncJobWorkspace />);
  fireEvent.click(screen.getByLabelText('Настройки AI'));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Модель' })).toHaveValue('glm-5.3-flash'));
  expect(screen.getByRole('combobox', { name: 'Модель' })).toHaveClass('reqai-control');
  expect(screen.getByRole('spinbutton', { name: 'Температура' })).toHaveClass('reqai-control');
  expect(screen.getByRole('combobox', { name: 'Reasoning' })).toHaveClass('reqai-control');
  expect(screen.getByRole('combobox', { name: 'Reasoning' })).toHaveValue('low');
  expect(screen.queryByRole('option', { name: 'Выключен' })).not.toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Температура' })).toHaveValue(0.7);
  const critic = screen.getByRole('switch', { name: 'Независимая проверка (критик)' });
  expect(critic).toBeChecked();
  fireEvent.click(critic);
  expect(critic).not.toBeChecked();
  first.unmount();
  render(<AsyncJobWorkspace />);
  fireEvent.click(screen.getByLabelText('Настройки AI'));
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Независимая проверка (критик)' })).not.toBeChecked());
});

test('reading a saved job preserves the unsent context draft and attachments', async () => {
  const item = { jobId: 'history-room', type: 'DECOMPOSITION', status: 'SUCCEEDED', title: 'Сохранённая задача', createdAt: new Date().toISOString() };
  mocks.listJobs.mockResolvedValue({ items: [item], nextCursor: null });
  mocks.getJob.mockResolvedValue(item);
  mocks.getResult.mockResolvedValue({ ...item, resultArtifactId: 'result' });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'DECOMPOSITION', requirements: { business: [], functional: [], nonfunctional: [] } }));
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'saved', sourceJobId: item.jobId, requirements: { business: [], functional: [], nonfunctional: [] }, decisions: {}, createdAt: item.createdAt }] });
  render(<AsyncJobWorkspace />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Бизнес-контекст' }), { target: { value: 'Будущая задача' } });
  fireEvent.change(screen.getByLabelText('Файл требований'), { target: { files: [new File(['draft'], 'draft.txt')] } });
  await selectHistoryEntry('Сохранённая задача');
  fireEvent.click(await screen.findByRole('button', { name: 'К черновику новой задачи' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toHaveValue('Будущая задача'));
  expect(screen.getByText('draft.txt')).toBeInTheDocument();
});

async function openSavedRoomReview({ source = false, title = null, decisions = {} } = {}) {
  const registry = roomBookingRegistry();
  const job = { jobId: 'rooms', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', ...(title ? { title } : {}), ...(source ? { inputArtifactId: 'source' } : {}) };
  if (source) mocks.downloadArtifact.mockResolvedValue({ text: async () => roomBookingBrief });
  window.history.replaceState({}, '', '/tasks/rooms');
  localStorage.setItem('reqai.requirementsLayout', 'rows');
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'rooms-result' });
  mocks.getResultContent.mockResolvedValue(JSON.stringify(registry));
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'rooms-v1', sourceJobId: 'rooms', registry, requirements: {}, decisions, createdAt: '2026-08-28T10:00:00Z' }] });
  render(<AsyncJobWorkspace />);
  await screen.findByRole('heading', { name: 'Сократить конфликты бронирования.' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'BR' } });
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: 'Сохранить мой черновик.' } });
}

test('keeps an open BABOK draft across type switches', async () => {
  await openSavedRoomReview();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'FR' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'BR' } });
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
});

test('GAP answer and dismissal join the shared draft without rewriting requirements', async () => {
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ }));
  fireEvent.click(within(document.getElementById('record-GAP-001')).getByRole('button', { name: 'Разобрать вопрос' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Ответ на GAP-001' }), { target: { value: 'Уведомлять по электронной почте.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Снять с рассмотрения…' }));
  expect(screen.getByRole('button', { name: 'Подтвердить решение' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Причина решения' }), { target: { value: 'Подтверждено владельцем процесса' } });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить решение' }));
  mocks.saveRequirementsVersion.mockImplementation(async (payload) => ({ ...payload, versionId: 'gap-version', createdAt: new Date().toISOString() }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalled());
  const payload = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(payload.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', closureKind: 'dismissed', answer: 'Уведомлять по электронной почте.', reason: 'Подтверждено владельцем процесса' });
  expect(payload.registry.groups.FR).toEqual(roomBookingRegistry().groups.FR);
});

test('GAP answer follows an embedded editor and closes with the applied requirement in one save', async () => {
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ }));
  fireEvent.click(within(document.getElementById('record-GAP-001')).getByRole('button', { name: 'Разобрать вопрос' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Ответ на GAP-001' }), { target: { value: 'Уведомлять по электронной почте.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать BR-001' }));
  const editor = within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Текст требования BR-001' });
  expect(editor).toHaveValue('Сохранить мой черновик.');
  fireEvent.change(editor, { target: { value: 'Сократить конфликты бронирования с уведомлением по электронной почте.' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Применить к черновику' }));
  expect(screen.getByLabelText('Ответ на GAP-001')).toHaveValue('Уведомлять по электронной почте.');
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить учёт ответа' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть как решённый' }));
  mocks.saveRequirementsVersion.mockImplementation(async (payload) => ({ ...payload, versionId: 'gap-applied', createdAt: new Date().toISOString() }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalled());
  const payload = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(payload.registry.groups.BR[0].text).toContain('с уведомлением по электронной почте');
  expect(payload.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', answer: 'Уведомлять по электронной почте.' });
});

test('adds a requirement without a completeness check and preserves historical review notes', async () => {
  const decisions = { review: {
    schemaVersion: 1,
    completeness: { checked: true, stale: false, recordedAt: '2026-08-28T09:00:00Z' },
    omissions: [{ id: 'OMISSION-history', text: 'Предыдущая заметка о пропуске', requirementIds: ['FR-002'] }],
  } };
  await openSavedRoomReview({ source: true, decisions });
  fireEvent.click(screen.getByRole('button', { name: 'Отмена', exact: true }));
  expect(screen.queryByText(/Полнота:|Сверить полноту/)).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Я сверил доступный исходный текст с требованиями' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Добавить требование'));
  fireEvent.click(screen.getByRole('button', { name: 'Функциональные требования', exact: true }));
  const input = await screen.findByRole('textbox', { name: 'Новое требование: FR' });
  fireEvent.change(input, { target: { value: 'Администратор повторно открывает комнату после обслуживания.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
  const group = document.getElementById('record-FR-003');
  expect(within(group).getByText('Администратор повторно открывает комнату после обслуживания.')).toBeInTheDocument();
  mocks.saveRequirementsVersion.mockImplementation(async (payload) => ({ ...payload, versionId: 'manual-version', createdAt: new Date().toISOString() }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalled());
  const payload = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(payload.registry.groups.FR).toHaveLength(3);
  expect(payload.decisions.review.omissions).toEqual(decisions.review.omissions);
  expect(payload.decisions.review.completeness).toMatchObject({ ...decisions.review.completeness, check: false, stale: true });
});

test('labels pending edits and makes saving explicit before AI research', async () => {
  await openSavedRoomReview();
  expect(screen.getByRole('button', { name: 'Сохранить черновик' })).toBeInTheDocument();
  expect(screen.queryByText(/^Черновик сохранён ·/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Запустить AI-исследование' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Завершить подготовку' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Сохранить черновик' })).toBeEnabled();
});

test('global save includes an open card draft and retains it after failure', async () => {
  mocks.saveRequirementsVersion.mockRejectedValue(new Error('Сеть недоступна'));
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    clientMutationId: expect.any(String), expectedLatestVersionId: 'rooms-v1',
    registry: expect.objectContaining({ groups: expect.objectContaining({ BR: [expect.objectContaining({ text: 'Сохранить мой черновик.' })] }) }),
  })));
  await screen.findByText(/Не удалось выполнить действие/);
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledTimes(2));
  expect(mocks.saveRequirementsVersion.mock.calls[1][0].clientMutationId).toBe(mocks.saveRequirementsVersion.mock.calls[0][0].clientMutationId);
});

test('guards new-task navigation while a card draft is pending', async () => {
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }));
  expect(screen.getByRole('dialog', { name: 'Несохранённые изменения' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Остаться' }));
  expect(window.location.pathname).toBe('/tasks/rooms');
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
});

test('automatically restores same-version edits after reload and clears them after a confirmed save', async () => {
  mocks.getCapabilities.mockResolvedValue({ tenantId: 'tenant', userId: 'user', capabilities: { models: ['glm-5.3-flash'] } });
  mocks.saveRequirementsVersion.mockImplementation(async (payload) => ({ ...payload, versionId: 'rooms-v2', createdAt: '2026-08-28T11:00:00Z' }));
  await openSavedRoomReview();
  const key = 'reqai.reviewDraft:["tenant","user"]:rooms';
  await waitFor(() => expect(sessionStorage.getItem(key)).toContain('Сохранить мой черновик.'));
  cleanup();
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await screen.findByText('Сохранить мой черновик.');
  expect(sessionStorage.getItem(key)).toBeNull();
});

test('global validation reveals an invalid field hidden in another type', async () => {
  await openSavedRoomReview();
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: '   ' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'FR' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Введите формулировку требования');
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveFocus());
  expect(mocks.saveRequirementsVersion).not.toHaveBeenCalled();
});

test('shows storage failure without losing the in-memory draft', async () => {
  mocks.getCapabilities.mockResolvedValue({ tenantId: 'tenant', userId: 'user', capabilities: {} });
  vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: () => {}, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); } });
  try {
    await openSavedRoomReview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Браузер не позволяет сохранить черновик');
    expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  } finally { vi.unstubAllGlobals(); }
});

test('explicitly rebases a pending field onto a new server version', async () => {
  await openSavedRoomReview();
  const remote = roomBookingRegistry();
  remote.groups.FR[0].text = 'Правка второго клиента';
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'rooms-v2', registry: remote, requirements: {}, decisions: {}, sourceJobId: 'rooms', createdAt: '2026-08-28T11:00:00Z' }] });
  const subscription = mocks.subscribe.mock.calls.find(([id]) => id === 'rooms')[1];
  await act(() => subscription.onEvent({ jobId: 'rooms', eventType: 'requirements.version-created' }));
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить новую версию' }));
  fireEvent.click(screen.getByRole('button', { name: 'Перенести мои правки' }));
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'FR' } });
  expect(screen.getByRole('heading', { name: 'Правка второго клиента' })).toBeInTheDocument();
  mocks.saveRequirementsVersion.mockRejectedValue(new Error('Test offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ expectedLatestVersionId: 'rooms-v2' })));
});

test('saves structured changes and original evidence together without closing the card', async () => {
  await openSavedRoomReview();
  fireEvent.change(screen.getByRole('textbox', { name: 'Критерий успеха BR-001' }), { target: { value: 'Не более двух конфликтов в месяц' } });
  fireEvent.click(screen.getByRole('button', { name: 'Пересмотреть оценку' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Качество BR-001' }), { target: { value: 'Готово' } });
  mocks.saveRequirementsVersion.mockRejectedValue(new Error('Test offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalled());
  const record = mocks.saveRequirementsVersion.mock.calls[0][0].registry.groups.BR[0];
  expect(record).toMatchObject({ text: 'Сохранить мой черновик.', successIndicator: 'Не более двух конфликтов в месяц', quality: 'Готово', source: roomBookingRegistry().groups.BR[0].source });
});

test('confirms deletion, supports undo, and does not reuse the deleted identifier', async () => {
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
  expect(screen.getByRole('dialog', { name: 'Удаление требования' })).toHaveTextContent('BR-001');
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
  expect(screen.queryByText('Сократить конфликты бронирования.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }));
  expect(screen.getByRole('heading', { name: 'Сократить конфликты бронирования.' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
  fireEvent.click(screen.getByText('Добавить требование', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Бизнес-требования', exact: true }));
  await screen.findByRole('textbox', { name: 'Новое требование: BR' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Новое требование: BR' }), { target: { value: 'Новая цель' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
  expect(screen.getByRole('button', { name: /^Выбрать BR-002:/ })).toBeInTheDocument();
});

test('question queue and embedded editing preserve the original unfinished draft', async () => {
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ }));
  expect(screen.getByRole('heading', { name: /Вопросы · открытых:/ })).toBeInTheDocument();
  fireEvent.click(within(document.getElementById('record-GAP-001')).getByRole('button', { name: 'Разобрать вопрос' }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать BR-001' }));
  expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть вопрос' }).at(-1));
  fireEvent.click(screen.getByRole('button', { name: /^Реестр ·/ }));
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
});

test('one type filter preserves drafts and leaves final layout preferences untouched', async () => {
  await openSavedRoomReview();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'all' } });
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  expect(screen.getByRole('button', { name: /^Выбрать FR-001:/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'FR' } });
  expect(screen.queryByRole('textbox', { name: 'Текст требования BR-001' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'BR' } });
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  expect(localStorage.getItem('reqai.requirementsLayout')).toBe('rows');
  expect(screen.queryByRole('group', { name: 'Вид требований' })).not.toBeInTheDocument();
});

async function openHistory() {
  fireEvent.click(await screen.findByRole('button', { name: 'История' }));
  return screen.findByRole('dialog', { name: 'История задач' });
}

async function selectHistoryEntry(name) {
  const drawer = await openHistory();
  const label = await within(drawer).findByText(name, { exact: true });
  fireEvent.click(label.closest('button'));
}

function expectBusinessStage(stage) {
  const region = screen.getByRole('region', { name: 'Прогресс подготовки требований' });
  expect(within(region).getByText(`Этап ${stage} из 4`)).toBeInTheDocument();
  expect(region).not.toHaveTextContent(`${stage * 25}%`);
}

function makeBabokRegistry() {
  const source = { artifactId: 'primary-artifact', locator: 'section:1', quote: null };
  const common = (id, text) => ({ id, text, source, provenance: 'Извлечено', quality: 'Готово' });
  const groups = {
    BR: [{ ...common('BR-001', 'Сократить время согласования'), successIndicator: 'Срок согласования подтверждён владельцем процесса', relatedIds: [] }],
    SR: [{ ...common('SR-001', 'Руководитель процесса видит статус заявки'), role: 'Руководитель процесса', relatedTo: [] }],
    FR: [{ ...common('FR-001', 'Система показывает статус заявки'), relatedTo: [] }],
    NFR: [{ ...common('NFR-001', 'Статус отображается без неоправданной задержки'), category: 'Производительность', scope: 'Рабочее место оператора', relatedTo: [], verificationMethod: 'Нагрузочное испытание' }],
    TR: [{ ...common('TR-001', 'Команда завершает обучение до запуска'), completionCriterion: 'Обучение подтверждено', relatedTo: [] }],
    CON: [{ ...common('CON-001', 'Обработка выполняется в рамках утверждённого регламента'), obligation: 'Соблюдать утверждённый регламент', scope: 'Процесс согласования', relatedTo: [] }],
  };
  return {
    schemaVersion: 'babok-requirements.v1', mode: 'DECOMPOSITION', outcome: 'COMPLETE',
    summary: { text: 'Полный реестр для проверки', counts: { BR: 1, SR: 1, FR: 1, NFR: 1, TR: 1, CON: 1, CTX: 0, GAP: 0, HYP: 0, TERM: 0, DELTA: 0 }, conclusions: [] },
    context: [], groups,
    analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [], questions: [] },
    materials: { primary: { artifactId: 'primary-artifact', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    scope: { partial: false, units: [{ id: 'unit-1', artifactId: 'primary-artifact', status: 'COMPLETE', section: 'all', note: null }] },
  };
}

test('shows the guided workflow and hides expert settings by default', async () => {
  render(<AsyncJobWorkspace />);
  expect(screen.getByRole('button', { name: 'Журнал задачи' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Журнал задачи' })).toHaveAttribute('title', 'Журнал будет доступен после запуска');
  expect(await screen.findByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: 'Подготовка требований' })).toBeInTheDocument();
  const steps = screen.getByRole('list', { name: 'Этапы подготовки требований' });
  expect(within(steps).getByText('Контекст')).toBeInTheDocument();
  expect(within(steps).getByText('AI-исследование')).toBeInTheDocument();
  expect(within(steps).queryByText('По желанию')).not.toBeInTheDocument();
  expectBusinessStage(1);
  expect(screen.getByText('Настройки AI')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Модель', hidden: true })).not.toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Reasoning', hidden: true })).not.toBeVisible();
  expect(screen.queryByText('Декомпозиция ещё не выполнена')).not.toBeInTheDocument();
});

test('sends the reasoning level and critic choice with a new decomposition', async () => {
  mocks.uploadArtifact.mockResolvedValue({ artifactId: 'artifact-1' });
  mocks.decomposeRequirements.mockResolvedValue({ jobId: 'job-1' });
  render(<AsyncJobWorkspace />);
  await screen.findByLabelText('Предыдущая версия требований');
  fireEvent.click(screen.getByText('Настройки AI').closest('summary'));
  const reasoning = screen.getByRole('combobox', { name: 'Reasoning' });
  expect(reasoning).toHaveValue('disabled');
  fireEvent.change(reasoning, { target: { value: 'high' } });
  fireEvent.click(screen.getByRole('switch', { name: 'Независимая проверка (критик)' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Бизнес-контекст' }), { target: { value: 'Сократить время обработки' } });
  fireEvent.click(screen.getByRole('button', { name: 'Декомпозировать требования' }));
  await waitFor(() => expect(mocks.decomposeRequirements).toHaveBeenCalledWith(expect.objectContaining({ reasoning: 'high', criticEnabled: false })));
});

test('restores abandoned active session with clear activity feedback', async () => {
  localStorage.setItem('reqai.activeJob', 'j1');
  mocks.getJob.mockResolvedValue({ jobId: 'j1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', progress: 40 });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'AI-исследование требований' })).toBeInTheDocument();
  expectBusinessStage(3);
  expect(screen.queryByText('Проводим исследование…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  expect(screen.queryByText('Результат появится на странице автоматически.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('progressbar', { name: 'Прогресс выполнения задачи' })).toHaveAttribute('aria-valuenow', '40');
});

test('shows honest backend milestones separately from business workflow progress and continues in background', async () => {
  const running = {
    jobId: 'honest-1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', progress: 20,
    currentStep: 'requirements-insights', message: 'AI анализирует требования', startedAt: new Date(Date.now() - 12_000).toISOString(),
  };
  localStorage.setItem('reqai.activeJob', running.jobId);
  mocks.getJob.mockResolvedValue(running);
  render(<AsyncJobWorkspace />);

  expect(await screen.findByText('Анализируем требования и контекст задачи')).toBeInTheDocument();
  const estimatedProgress = screen.getByRole('progressbar', { name: 'Прогресс выполнения задачи' });
  expect(Number(estimatedProgress.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  expect(Number(estimatedProgress.getAttribute('aria-valuenow'))).toBeLessThan(90);
  expect(estimatedProgress).toHaveAttribute('aria-valuetext', expect.stringContaining('ориентировочная оценка'));
  expectBusinessStage(3);
  expect(screen.getByRole('listitem', { name: 'Подготовка: завершено' })).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'AI-анализ: выполняется' })).toHaveAttribute('aria-current', 'step');
  expect(screen.queryByText(/Сейчас в фокусе:/)).not.toBeInTheDocument();
  expect(screen.getByText(/Оценка ожидания: несколько минут/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Об ориентировочной оценке прогресса')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Прошло 00:1[12]/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Продолжить в фоне' }));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  const indicator = await screen.findByRole('button', { name: 'Фоновая задача: AI анализирует требования. Этап: AI-анализ' });
  expect(Number(indicator.textContent.match(/(\d+)%/)?.[1])).toBeGreaterThan(20);
  expect(Number(indicator.textContent.match(/(\d+)%/)?.[1])).toBeLessThan(90);
  expect(screen.queryByRole('region', { name: 'Выполнение задачи' })).not.toBeInTheDocument();

  fireEvent.click(indicator);
  await waitFor(() => expect(window.location.pathname).toBe('/tasks/honest-1'));
  expect(await screen.findByText('Анализируем требования и контекст задачи')).toBeInTheDocument();
});

test('continues the overall percentage through an authoritative assembly milestone', async () => {
  const running = {
    jobId: 'estimate-1', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 20,
    currentStep: 'model', message: 'AI формирует структуру требований', startedAt: new Date(Date.now() - 60_000).toISOString(),
  };
  let onEvent;
  localStorage.setItem('reqai.activeJob', running.jobId);
  mocks.getJob.mockResolvedValue(running);
  mocks.subscribe.mockImplementation((jobId, options) => { onEvent = options.onEvent; return Promise.resolve(); });
  render(<AsyncJobWorkspace />);

  const progress = await screen.findByRole('progressbar', { name: 'Прогресс выполнения задачи' });
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeLessThan(70);
  expect(progress).toHaveAttribute('aria-valuetext', expect.stringContaining('ориентировочная оценка'));
  expect(screen.getByRole('listitem', { name: 'AI-анализ: выполняется' })).toBeInTheDocument();

  const assembly = { ...running, progress: 70, currentStep: 'assembly', message: 'Собираем требования по категориям', updatedAt: new Date(Date.now() - 30_000).toISOString() };
  await waitFor(() => expect(onEvent).toBeTypeOf('function'));
  await act(() => onEvent({ jobId: running.jobId, eventType: 'job.progress', job: assembly }));
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(70);
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeLessThan(90);
  expect(progress).toHaveAttribute('aria-valuetext', expect.stringContaining('ориентировочная оценка'));
  expect(screen.getByText(/\d+% · Сборка/)).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'AI-анализ: завершено' })).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'Сборка: выполняется' })).toHaveAttribute('aria-current', 'step');

  mocks.getJob.mockResolvedValue(assembly);
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить в фоне' }));
  const indicator = await screen.findByRole('button', { name: 'Фоновая задача: Собираем требования по категориям. Этап: Сборка' });
  expect(Number(indicator.textContent.match(/(\d+)%/)?.[1])).toBeGreaterThanOrEqual(70);
  expect(Number(indicator.textContent.match(/(\d+)%/)?.[1])).toBeLessThan(90);
});

test('shows a realistic decomposition duration without warning before the expected window ends', async () => {
  const running = {
    jobId: 'duration-1', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 20,
    currentStep: 'model', message: 'AI формирует структуру требований', startedAt: new Date(Date.now() - 239_000).toISOString(),
  };
  localStorage.setItem('reqai.activeJob', running.jobId);
  mocks.getJob.mockResolvedValue(running);
  render(<AsyncJobWorkspace />);

  expect(await screen.findByText(/Оценка ожидания: 2–4 минуты/)).toBeInTheDocument();
  expect(screen.queryByText('Обработка занимает больше оценочного времени. Последний подтверждённый этап показан ниже.')).not.toBeInTheDocument();
});

test('explains a decomposition run that exceeds the four-minute estimate', async () => {
  const running = {
    jobId: 'duration-2', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 90,
    currentStep: 'persistence', message: 'Сохраняем требования', startedAt: new Date(Date.now() - 241_000).toISOString(), updatedAt: new Date(Date.now() - 30_000).toISOString(),
  };
  localStorage.setItem('reqai.activeJob', running.jobId);
  mocks.getJob.mockResolvedValue(running);
  render(<AsyncJobWorkspace />);

  expect(await screen.findByText('Обработка занимает больше оценочного времени. Последний подтверждённый этап показан ниже.')).toBeInTheDocument();
  const progress = screen.getByRole('progressbar', { name: 'Прогресс выполнения задачи' });
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(90);
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeLessThan(100);
  expect(progress).toHaveAttribute('aria-valuetext', expect.stringContaining('ориентировочная оценка'));
  expect(screen.getByText(/\d+% · Сохранение/)).toBeInTheDocument();
});

test('reconciles a background job, notifies on completion and opens its result', async () => {
  const running = { jobId: 'background-1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', progress: 82, message: 'Собираем итог' };
  const completed = { ...running, status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100, message: 'Готово' };
  localStorage.setItem('reqai.backgroundJob', running.jobId);
  mocks.listJobs.mockResolvedValue({ items: [completed], nextCursor: null });
  mocks.getJob.mockResolvedValue(completed);
  mocks.getResult.mockResolvedValue({ jobId: running.jobId, type: 'RESEARCH', mode: 'AGENT_RESEARCH', outcome: 'COMPLETE', resultArtifactId: null, modelAttempts: [] });

  render(<AsyncJobWorkspace />);

  const notice = await screen.findByRole('status', { name: 'Задача завершена' });
  expect(within(notice).getByText('Задача готова')).toBeInTheDocument();
  expect(localStorage.getItem('reqai.backgroundJob')).toBeNull();
  expect(screen.queryByRole('button', { name: /Фоновая задача:/ })).not.toBeInTheDocument();
  fireEvent.click(within(notice).getByRole('button', { name: 'Открыть результат' }));
  await waitFor(() => expect(window.location.pathname).toBe('/tasks/background-1'));
  await waitFor(() => expect(mocks.getResult).toHaveBeenCalledWith('background-1', expect.any(Object)));
});

test('reconciles a running remembered background job after the initial refresh', async () => {
  const running = { jobId: 'background-reconcile', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', progress: 35, message: 'Проводим исследование' };
  const completed = { ...running, status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100, message: 'Результат готов' };
  localStorage.setItem('reqai.backgroundJob', running.jobId);
  mocks.listJobs.mockResolvedValue({ items: [running], nextCursor: null });
  mocks.getJob.mockResolvedValue(completed);

  render(<AsyncJobWorkspace />);

  const notice = await screen.findByRole('status', { name: 'Задача завершена' });
  expect(within(notice).getByText('Задача готова')).toBeInTheDocument();
  expect(within(notice).getByText('Исследование')).toBeInTheDocument();
  expect(mocks.getJob).toHaveBeenCalledWith('background-reconcile');
  expect(localStorage.getItem('reqai.backgroundJob')).toBeNull();
});

test('opens compact history drawer, filters jobs and renders localized partial status', async () => {
  mocks.listJobs.mockResolvedValue({ items: [
    { jobId: 'j2', type: 'RESEARCH', mode: 'STANDARD_RESEARCH', status: 'SUCCEEDED', outcome: 'PARTIAL', createdAt: new Date().toISOString() },
    { jobId: 'd2', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() },
  ], nextCursor: null });
  render(<AsyncJobWorkspace />);
  const visibleDrawer = await openHistory();
  expect(await within(visibleDrawer).findByText('Готово частично')).toBeInTheDocument();
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'd2', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', createdAt: new Date().toISOString() }], nextCursor: null });
  fireEvent.click(within(visibleDrawer).getByRole('button', { name: 'Декомпозиция' }));
  expect(within(visibleDrawer).queryByText('Исследование', { exact: true })).not.toBeInTheDocument();
  expect(await within(visibleDrawer).findByText('Подготовка требований', { exact: true })).toBeInTheDocument();
  expect(mocks.listJobs).toHaveBeenLastCalledWith({ groupBy: 'workflow', limit: 20, type: 'DECOMPOSITION' }, expect.any(Object));
});

test('cancels active job and reconciles authoritative REST state', async () => {
  mocks.getJob.mockResolvedValueOnce({ jobId: 'j3', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 10 })
    .mockResolvedValueOnce({ jobId: 'j3', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'CANCEL_REQUESTED', progress: 10 });
  localStorage.setItem('reqai.activeJob', 'j3');
  mocks.cancelJob.mockResolvedValue({});
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('button', { name: 'Развернуть форму бизнес-задачи' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Декомпозиция выполняется…' })).not.toBeInTheDocument();
  expect(screen.queryByText('Декомпозируем требования…')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByText('Отменить'));
  await waitFor(() => expect(mocks.cancelJob).toHaveBeenCalledWith('j3'));
});

test('shows a dedicated state card only for an exceptional retry state', async () => {
  localStorage.setItem('reqai.activeJob', 'retry-1');
  mocks.getJob.mockResolvedValue({ jobId: 'retry-1', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RETRY_WAIT', progress: 35 });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByText('Повторяем проблемный этап…')).toBeInTheDocument();
  expect(screen.getByText('Результат появится на странице автоматически.')).toBeInTheDocument();
});

test('shows a safe contract-specific message for a failed decomposition', async () => {
  localStorage.setItem('reqai.activeJob', 'failed-contract-1');
  mocks.getJob.mockResolvedValue({ jobId: 'failed-contract-1', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'FAILED', reasonCode: 'OUTPUT_CONTRACT_VIOLATION', progress: 20 });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByText('Не удалось завершить задачу')).toBeInTheDocument();
  expect(screen.getByText('Ответ AI не соответствует формату требований. Попробуйте запустить задачу ещё раз.')).toBeInTheDocument();
  expect(screen.queryByText(/provenance|invalid output/i)).not.toBeInTheDocument();
});

test('does not expose retired standalone launchers', async () => {
  render(<AsyncJobWorkspace />);
  await screen.findByRole('heading', { name: 'Подготовка требований' });
  expect(screen.queryByText('Дополнительные инструменты')).not.toBeInTheDocument();
  expect(screen.queryByText('Тестирование промптов')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Декомпозировать требования' })).toBeInTheDocument();
});

test('launching research from the requirements workspace saves pending edits before starting the job', async () => {
  const content = JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: {
    business: [{ id: 'BT-1', text: 'Снизить срок обработки' }], functional: [{ id: 'FT-1', text: 'Автоматизировать проверку' }], nonfunctional: [],
  } }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'j4', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValueOnce({ jobId: 'j4', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 })
    .mockResolvedValue({ jobId: 'research-1', parentJobId: 'j4', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'ACCEPTED', progress: 0 });
  mocks.getResult.mockResolvedValue({ jobId: 'j4', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'a4', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.saveRequirementsVersion.mockImplementation(async ({ requirements }) => ({ versionId: 'version-1', sourceJobId: 'j4', requirements, createdAt: new Date().toISOString() }));
  mocks.researchRequirements.mockResolvedValue({ jobId: 'research-1' });
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Подготовка требований');
  expect(window.location.pathname).toBe('/tasks/j4');
  expect(await screen.findByRole('heading', { name: 'Требования' })).toBeInTheDocument();
  expect(screen.getByText('Этап 2 из 4')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Этапы подготовки требований' })).toBeInTheDocument();
  expectBusinessStage(2);
  const contextSummary = screen.getByLabelText('Исходный бизнес-контекст');
  expect(contextSummary.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).not.toBeVisible();
  expect(screen.queryByText('Результат задачи')).not.toBeInTheDocument();
  fireEvent.click(contextSummary);
  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toBeVisible();
  const researchButton = screen.getByRole('button', { name: 'Запустить AI-исследование' });
  expect(researchButton).toBeEnabled();
  expect(researchButton.closest('header')).toHaveAttribute('aria-label', 'Работа с требованиями');
  expect(screen.queryByRole('tablist', { name: 'Категории требований' })).not.toBeInTheDocument();
  const businessColumn = screen.getByRole('region', { name: 'Бизнес-требования' });
  const functionalColumn = screen.getByRole('region', { name: 'Функциональные требования' });
  expect(screen.queryByRole('region', { name: 'Нефункциональные требования' })).not.toBeInTheDocument();
  expect(within(businessColumn).getByText('Снизить срок обработки')).toBeInTheDocument();
  expect(within(functionalColumn).getByText('Автоматизировать проверку')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Нефункциональные требования · 0' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Новое требование: Бизнес-требования')).not.toBeInTheDocument();
  fireEvent.click(within(functionalColumn).getByRole('button', { name: 'Добавить требование' }));
  expect(screen.getByLabelText('Новое требование: Функциональные требования')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.queryByLabelText('Новое требование: Функциональные требования')).not.toBeInTheDocument();
  fireEvent.click(within(businessColumn).getByRole('button', { name: 'Действия для BT-1' }));
  fireEvent.click(within(businessColumn).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByLabelText('Текст требования BT-1'), { target: { value: 'Снизить срок обработки до одного дня' } });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.getByRole('button', { name: 'Сохранить черновик' })).not.toHaveClass('bg-indigo-600');
  expect(researchButton).toHaveClass('bg-indigo-600');
  fireEvent.click(screen.getByLabelText('Настройки AI'));
  fireEvent.click(screen.getByRole('switch', { name: 'Независимая проверка (критик)' }));
  expect(mocks.saveRequirementsVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Запустить AI-исследование' }));
  await waitFor(() => expect(mocks.researchRequirements).toHaveBeenCalledWith('version-1', { model: 'GC-Max', temperature: 0.2, reasoning: 'disabled', criticEnabled: false }));
  expect(await screen.findByRole('heading', { name: 'AI-исследование требований' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  expect(mocks.researchRequirements).toHaveBeenCalledTimes(1);
  expect(mocks.saveRequirementsVersion).toHaveBeenCalledTimes(1);
  expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    requirements: expect.objectContaining({ business: [expect.objectContaining({ text: 'Снизить срок обработки до одного дня' })] }),
  }));
  expect(screen.getByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
});

test('finishes requirements without AI research and switches category layout', async () => {
  const requirements = {
    business: [{ id: 'BT-1', text: 'Снизить срок обработки' }],
    functional: [{ id: 'FT-1', text: 'Автоматизировать проверку' }],
    nonfunctional: [],
  };
  const content = JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: requirements }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'j-skip', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'j-skip', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'j-skip', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'a-skip', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'reviewed-v1' }] });
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'reviewed-v1', sourceJobId: 'j-skip', createdAt: new Date().toISOString(), requirements, decisions: {} });
  mocks.saveRequirementsVersion.mockImplementation(async ({ baseVersionId, requirements: savedRequirements, decisions }) => ({ versionId: 'final-direct-v1', sourceJobId: 'j-skip', baseVersionId, createdAt: new Date().toISOString(), requirements: savedRequirements, decisions }));

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Подготовка требований');

  const categories = await screen.findByLabelText('Категории требований');
  expect(categories).toHaveClass('grid-cols-1');
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'functional' } });
  expect(categories).toHaveClass('grid-cols-1');
  expect(categories).not.toHaveClass('xl:grid-cols-3');
  expect(localStorage.getItem('reqai.requirementsView')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Завершить подготовку' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    sourceJobId: 'j-skip',
    baseVersionId: 'reviewed-v1',
    decisions: expect.objectContaining({ skippedResearch: true }),
  })));

  expect(await screen.findByRole('heading', { name: 'Финальная версия требований' })).toBeInTheDocument();
  expect(screen.queryByText('AI-исследование пропущено. Итоговые формулировки можно редактировать вручную.')).not.toBeInTheDocument();
  expectBusinessStage(4);
  expect(screen.getByText('Пропущено')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'К результатам AI-исследования' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Добавить AI-исследование' })).toBeInTheDocument();
  expect(screen.getByLabelText('Финальные требования по категориям')).toHaveClass('grid-cols-1');
});

test('receives remote versions on a completed job without overwriting local unsaved edits', async () => {
  const original = { business: [{ id: 'BT-1', text: 'Исходная версия' }], functional: [], nonfunctional: [] };
  const remote = { business: [{ id: 'BT-1', text: 'Версия из другой вкладки' }], functional: [], nonfunctional: [] };
  let onEvent;
  localStorage.setItem('reqai.viewedJob', 'sync-job');
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'sync-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'sync-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'sync-job', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'artifact-sync', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: original }] }));
  mocks.listRequirementsVersions.mockResolvedValueOnce({ items: [{ versionId: 'version-1' }] });
  mocks.getRequirementsVersion.mockResolvedValueOnce({ versionId: 'version-1', sourceJobId: 'sync-job', requirements: original, decisions: {}, createdAt: new Date().toISOString() });
  mocks.subscribe.mockImplementation((jobId, options) => { onEvent = options.onEvent; return Promise.resolve(); });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByText('Исходная версия')).toBeInTheDocument();
  await waitFor(() => expect(onEvent).toBeTypeOf('function'));

  const businessColumn = screen.getByRole('region', { name: 'Бизнес-требования' });
  fireEvent.click(within(businessColumn).getByRole('button', { name: 'Действия для BT-1' }));
  fireEvent.click(within(businessColumn).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByLabelText('Текст требования BT-1'), { target: { value: 'Моя несохранённая версия' } });

  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'version-2' }] });
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'version-2', sourceJobId: 'sync-job', requirements: remote, decisions: {}, createdAt: new Date().toISOString() });
  await act(() => onEvent({ eventType: 'requirements.version-created', jobId: 'sync-job', versionId: 'version-2' }));
  expect(screen.getByDisplayValue('Моя несохранённая версия')).toBeInTheDocument();
  expect(screen.getByText('Доступна новая сохранённая версия')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Загрузить новую версию' }));
  expect(screen.getByRole('dialog', { name: 'Сравнение версий' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отбросить мои правки и загрузить' }));
  expect(await screen.findByText('Версия из другой вкладки')).toBeInTheDocument();
  expect(screen.queryByText('Доступна новая сохранённая версия')).not.toBeInTheDocument();
});

test('keeps the selected parent on a linked research event and follows only an explicit action', async () => {
  const requirementsValue = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] };
  let onEvent;
  const subscriptions = [];
  localStorage.setItem('reqai.viewedJob', 'parent-job');
  mocks.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  mocks.getJob.mockImplementation(async (id) => id === 'research-job'
    ? { jobId: 'research-job', parentJobId: 'parent-job', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', progress: 20 }
    : { jobId: 'parent-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'parent-job', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'artifact-parent', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: requirementsValue }] }));
  mocks.subscribe.mockImplementation((jobId, options) => { subscriptions.push({ jobId, signal: options.signal }); onEvent = options.onEvent; return Promise.resolve(); });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByText('Цель')).toBeInTheDocument();
  await waitFor(() => expect(onEvent).toBeTypeOf('function'));
  await act(() => onEvent({ eventType: 'requirements.version-created', jobId: 'another-job' }));
  expect(mocks.listRequirementsVersions).toHaveBeenCalledTimes(1);

  await act(() => onEvent({ eventType: 'linked-research.created', jobId: 'parent-job', linkedJobId: 'research-job' }));
  expect(window.location.pathname).toBe('/tasks/parent-job');
  expect(screen.getByText('Цель')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть AI-исследование' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отбросить и перейти' }));
  expect(await screen.findByRole('heading', { name: 'AI-исследование требований' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/tasks/research-job');
  expect(localStorage.getItem('reqai.viewedJob')).toBeNull();
  await waitFor(() => expect(subscriptions.map(({ jobId }) => jobId)).toEqual(['parent-job', 'research-job', 'research-job']));
  expect(subscriptions[0].signal.aborted).toBe(true);
  expect(subscriptions[1].signal.aborted).toBe(true);
  expect(subscriptions[2].signal.aborted).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться в реестр требований' }));
  await waitFor(() => expectBusinessStage(2));
  expect(window.location.pathname).toBe('/tasks/parent-job');
  expect(await screen.findByRole('region', { name: 'Бизнес-требования' })).toHaveTextContent('Цель');
});

test('loads the job from a direct permanent URL and ignores conflicting legacy selection', async () => {
  window.history.replaceState({}, '', '/tasks/url-job');
  localStorage.setItem('reqai.viewedJob', 'legacy-job');
  mocks.getJob.mockResolvedValue({ jobId: 'url-job', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', progress: 10 });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Результат старой версии' })).toBeInTheDocument();
  expect(mocks.getJob).toHaveBeenCalledWith('url-job', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(mocks.getJob).not.toHaveBeenCalledWith('legacy-job', expect.anything());
  expect(window.location.pathname).toBe('/tasks/url-job');
});

test('keeps an unavailable deep link stable without opening another remembered job', async () => {
  window.history.replaceState({}, '', '/tasks/missing-job');
  localStorage.setItem('reqai.viewedJob', 'other-job');
  mocks.getJob.mockRejectedValue(Object.assign(new Error('Job not found'), { code: 'JOB_NOT_FOUND' }));
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Задача недоступна' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/tasks/missing-job');
  expect(mocks.getJob).not.toHaveBeenCalledWith('other-job', expect.anything());
});

test('transient deep-link failure offers retry for the same task instead of suggesting missing access', async () => {
  window.history.replaceState({}, '', '/tasks/retry-job');
  mocks.getJob.mockRejectedValueOnce(Object.assign(new Error('HTTP 503'), { status: 503 }))
    .mockResolvedValue({ jobId: 'retry-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'CANCELLED' });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Не удалось загрузить задачу' })).toBeInTheDocument();
  expect(screen.queryByText(/Проверьте адрес или права доступа/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  expect(await screen.findByRole('heading', { name: 'Задача отменена' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/tasks/retry-job');
  expect(mocks.getJob.mock.calls.every(([id]) => id === 'retry-job')).toBe(true);
});

test('ignores a stale route load after browser navigation selects another task', async () => {
  window.history.replaceState({}, '', '/tasks/slow-job');
  let resolveSlow;
  const slowJob = new Promise((resolve) => { resolveSlow = resolve; });
  mocks.getJob.mockImplementation((id) => id === 'slow-job'
    ? slowJob
    : Promise.resolve({ jobId: 'fast-job', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', progress: 20 }));

  render(<AsyncJobWorkspace />);
  await waitFor(() => expect(mocks.getJob).toHaveBeenCalledWith('slow-job', expect.anything()));
  window.history.pushState({}, '', '/tasks/fast-job');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(await screen.findByRole('heading', { name: 'Результат старой версии' })).toBeInTheDocument();

  await act(async () => resolveSlow({ jobId: 'slow-job', type: 'RESEARCH', mode: 'PROMPT_TEST', status: 'RUNNING', progress: 50 }));
  expect(window.location.pathname).toBe('/tasks/fast-job');
  expect(screen.getByText('AGENT_RESEARCH')).toBeInTheDocument();
  expect(screen.queryByText('PROMPT_TEST')).not.toBeInTheDocument();
});

test('opens accessible Debug timeline, shows local SSE observations and removes inline technical block', async () => {
  window.history.replaceState({}, '', '/tasks/debug-job');
  let onObservation;
  mocks.getJob.mockResolvedValue({ jobId: 'debug-job', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', currentStep: 'research', createdAt: new Date().toISOString() });
  mocks.subscribe.mockImplementation((jobId, options) => { onObservation = options.onObservation; return Promise.resolve(); });
  mocks.getJobTrace.mockResolvedValue({ jobId: 'debug-job', status: 'RUNNING', currentStep: 'research', createdAt: new Date().toISOString(), durationMs: null, timeline: [{ id: 'event:1', source: 'SERVER_EVENT', category: 'EVENT', name: 'job.accepted', status: 'INFO', startedAt: new Date().toISOString(), durationMs: 0, metadata: { sequence: 1 }, detail: { state: 'NOT_RECORDED' } }], nextCursor: null });
  render(<AsyncJobWorkspace />);
  const trigger = await screen.findByRole('button', { name: 'Журнал задачи' });
  await waitFor(() => expect(trigger).toBeEnabled());
  await waitFor(() => expect(onObservation).toBeTypeOf('function'));
  expect(screen.queryByText('Техническая информация')).not.toBeInTheDocument();
  await act(() => onObservation({ type: 'reconnect', jobId: 'debug-job', cursor: 1, timestamp: new Date().toISOString() }));
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Журнал задачи' });
  expect(within(dialog).getByText(/Браузер восстанавливает связь/)).toBeVisible();
  expect(await within(dialog).findByText('job.accepted')).toBeVisible();
  expect(within(within(dialog).getByRole('list', { name: 'Хронология выполнения задачи' })).getByText('текущая вкладка')).toBeVisible();
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Журнал задачи' })).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

test('loads protected Debug details lazily and paginates in the responsive panel', async () => {
  window.history.replaceState({}, '', '/tasks/debug-detail-job');
  mocks.getJob.mockResolvedValue({ jobId: 'debug-detail-job', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', currentStep: 'research', createdAt: new Date().toISOString() });
  mocks.getJobTrace
    .mockResolvedValueOnce({ jobId: 'debug-detail-job', status: 'RUNNING', createdAt: new Date().toISOString(), timeline: [{ id: '00000000-0000-4000-8000-000000000010', source: 'TRACE', category: 'MODEL', name: 'LLM output', status: 'COMPLETED', startedAt: new Date().toISOString(), durationMs: 12, metadata: { model: 'm1' }, detail: { state: 'AVAILABLE', kind: 'OUTPUT' } }], nextCursor: 'next-page' })
    .mockResolvedValueOnce({ jobId: 'debug-detail-job', status: 'RUNNING', createdAt: new Date().toISOString(), timeline: [{ id: 'event:2', source: 'SERVER_EVENT', category: 'EVENT', name: 'job.progress', status: 'INFO', startedAt: new Date().toISOString(), durationMs: 0, metadata: {}, detail: { state: 'NOT_RECORDED' } }], nextCursor: null });
  mocks.getJobTraceDetail.mockResolvedValue({ entryId: '00000000-0000-4000-8000-000000000010', state: 'REDACTED', content: null });

  render(<AsyncJobWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Журнал задачи' }));
  const dialog = await screen.findByRole('dialog', { name: 'Журнал задачи' });
  expect(dialog.querySelector('aside')).toHaveClass('w-full', 'lg:max-w-2xl');
  expect(mocks.getJobTraceDetail).not.toHaveBeenCalled();
  await within(dialog).findByText('LLM output');
  fireEvent.click(within(dialog).getByRole('button', { name: /LLM output/ }));
  await waitFor(() => expect(mocks.getJobTraceDetail).toHaveBeenCalledWith('debug-detail-job', '00000000-0000-4000-8000-000000000010'));
  expect(await within(dialog).findByText(/"state": "REDACTED"/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Загрузить ещё' }));
  expect(await within(dialog).findByText('job.progress')).toBeInTheDocument();
  expect(mocks.getJobTrace).toHaveBeenLastCalledWith('debug-detail-job', { cursor: 'next-page', limit: 50 });
});

test.each(['decomposition', 'research'])('shows the audit failure in the journal and keeps the editor on the task page in %s', async (workflow) => {
  const research = workflow === 'research';
  const job = {
    jobId: 'audit-stopped', status: 'SUCCEEDED', outcome: 'PARTIAL', type: research ? 'RESEARCH' : 'DECOMPOSITION',
    mode: research ? 'REQUIREMENTS_INSIGHTS' : 'DECOMPOSITION',
  };
  const registry = roomBookingRegistry();
  const manualRegistry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  manualRegistry.materials.primary = registry.materials.primary;
  window.history.replaceState({}, '', '/tasks/audit-stopped');
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'audit-draft', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify(research
    ? { mode: job.mode, recovery: {}, baseDecisions: {}, baseRegistry: registry, inputRequirementsVersionId: 'saved-v1', insights: [] }
    : { mode: job.mode, recovery: { draft: createBabokTextDraft(['Система хранит дату заявки.']) }, manualRegistry }));
  mocks.getJobTrace.mockResolvedValue({ ...job, timeline: [{
    id: 'audit-rejected', source: 'TRACE', category: 'VALIDATION', name: 'BABOK audit rejected', status: 'FAILED',
    metadata: { issues: [{ key: '$', code: 'SEMANTIC_AUDIT_INVALID' }] }, detail: { state: 'NOT_RECORDED' },
  }], nextCursor: null });

  render(<AsyncJobWorkspace />);
  const target = research ? await screen.findByRole('heading', { name: 'Финальная версия требований' }).then((node) => node.closest('#task-result'))
    : await screen.findByRole('region', { name: 'Формулировки AI на проверку' });
  expect(screen.getByText(research ? /Продолжите с сохранёнными требованиями/ : /Черновик сохранён/)).toBeVisible();
  const trigger = screen.getByRole('button', { name: 'Журнал задачи' });
  fireEvent.click(trigger);
  const dialog = within(screen.getByRole('dialog', { name: 'Журнал задачи' }));
  expect(await dialog.findByText('Ответ независимой проверки отклонён')).toBeVisible();
  expect(dialog.getByText('Ответ проверяющей модели оказался в неверном формате.')).toBeVisible();
  expect(dialog.queryByText('Этапы выполнения')).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(target).toBeVisible();
  expect(trigger).toHaveFocus();
  expect(window.location.pathname).toBe('/tasks/audit-stopped');
  expect(mocks.decomposeRequirements).not.toHaveBeenCalled();
  expect(mocks.researchRequirements).not.toHaveBeenCalled();
});

test('starts a clean new task from a terminal workflow and keeps the completed job in history', async () => {
  const savedRequirements = { business: [{ id: 'BT-1', text: 'Сохранённый результат' }], functional: [], nonfunctional: [] };
  const historyItem = { jobId: 'completed-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() };
  localStorage.setItem('reqai.viewedJob', 'completed-job');
  mocks.listJobs.mockResolvedValue({ items: [historyItem], nextCursor: null });
  mocks.getJob.mockResolvedValue({ ...historyItem, progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'completed-job', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'completed-artifact', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: savedRequirements }] }));
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'completed-version' }] });
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'completed-version', sourceJobId: 'completed-job', requirements: savedRequirements, decisions: {}, createdAt: new Date().toISOString() });

  const view = render(<AsyncJobWorkspace />);
  expect(await screen.findByText('Сохранённый результат')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Новая задача' }));
  expect(window.location.pathname).toBe('/');
  expect(screen.getByRole('heading', { name: 'Сформулируйте бизнес-задачу' })).toBeInTheDocument();
  expectBusinessStage(1);
  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toHaveValue('');
  expect(localStorage.getItem('reqai.viewedJob')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Новая задача' })).not.toBeInTheDocument();

  const drawer = await openHistory();
  expect(await within(drawer).findByText('Подготовка требований', { exact: true })).toBeInTheDocument();
  view.unmount();
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Сформулируйте бизнес-задачу' })).toBeInTheDocument();
});

test('localizes an active-job admission rejection and restores the linked research action', async () => {
  const content = JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: {
    business: [{ id: 'BT-1', text: 'Снизить срок обработки' }], functional: [], nonfunctional: [],
  } }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'j-limit', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'j-limit', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'j-limit', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'a-limit', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'version-limit' }] });
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'version-limit', sourceJobId: 'j-limit', createdAt: new Date().toISOString(), requirements: { business: [{ id: 'BT-1', text: 'Снизить срок обработки' }], functional: [], nonfunctional: [] } });
  mocks.researchRequirements.mockRejectedValue(Object.assign(new Error('Active job limit reached for user'), { code: 'USER_ACTIVE_JOB_LIMIT' }));

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Подготовка требований');
  const researchButton = await screen.findByRole('button', { name: 'Запустить AI-исследование' });
  fireEvent.click(researchButton);

  expect(await screen.findByText('Другая задача уже выполняется. Дождитесь её завершения и попробуйте снова.')).toBeInTheDocument();
  expect(screen.queryByText(/USER_ACTIVE_JOB_LIMIT|Active job limit reached for user/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Запустить AI-исследование' })).toBeEnabled();
  expect(mocks.researchRequirements).toHaveBeenCalledTimes(1);
});

test('restores requirements insights and applies explicit accepted enhancements', async () => {
  const content = JSON.stringify({ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: { business: [{ id: 'BT-1', text: 'Сократить срок' }], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'base-v2', insights: [{ id: 'i1', category: 'trends', title: 'Мгновенная обработка', summary: 'Рынок переходит к автоматизации', detail: 'Клиенты ожидают быстрый ответ.', applicability: 90, source_types: ['market_research'], relatedTo: ['BT-1'], enhancements: [{ targetType: 'functional', text: 'Система должна автоматически обрабатывать заявку' }] }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'ri1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'ri1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'ri1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', outcome: 'COMPLETE', resultArtifactId: 'ria1', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  let savedRevision = 1;
  mocks.saveRequirementsVersion.mockImplementation(async ({ requirements, decisions, baseVersionId }) => ({ versionId: `final-v${++savedRevision}`, sourceJobId: 'ri1', baseVersionId, createdAt: new Date().toISOString(), requirements, decisions }));
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('AI-исследование требований');
  expect(await screen.findByText('Результаты AI-исследования')).toBeInTheDocument();
  expect(screen.queryByText('Настройки этого результата')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Экспорт ▾' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Сформулируйте бизнес-задачу' })).not.toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Этапы подготовки требований' })).toBeInTheDocument();
  expectBusinessStage(3);
  expect(screen.getByRole('button', { name: 'Все результаты · 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Тренды рынка · 1' })).toBeInTheDocument();
  const insightCards = screen.getByRole('region', { name: 'Результаты AI-исследования: список и детали' });
  expect(within(insightCards).getAllByRole('article')).toHaveLength(1);
  expect(within(insightCards).getByText('90% · оценка применимости')).toBeInTheDocument();
  expect(within(insightCards).getAllByTestId('insight-category-icon-trends')).toHaveLength(2);
  const insightCard = within(insightCards).getByRole('article');
  expect(within(insightCard).getByText('Рынок переходит к автоматизации')).not.toHaveClass('line-clamp-2');
  expect(within(insightCard).getByTestId('insight-relations-i1')).toBeVisible();
  expect(within(insightCard).getByText('Клиенты ожидают быстрый ответ.')).toBeVisible();
  expect(within(insightCard).getByText('Исследование рынка')).toBeVisible();
  expect(within(insightCard).getByText('Система должна автоматически обрабатывать заявку')).toBeVisible();
  const rejectEnhancement = within(insightCard).getByRole('button', { name: 'Отклонить улучшение: Система должна автоматически обрабатывать заявку' });
  fireEvent.click(rejectEnhancement);
  expect(rejectEnhancement).toHaveAttribute('aria-pressed', 'true');
  const acceptEnhancement = screen.getByRole('button', { name: 'Принять улучшение: Система должна автоматически обрабатывать заявку' });
  fireEvent.click(acceptEnhancement);
  expect(acceptEnhancement).toHaveAttribute('aria-pressed', 'false');
  const diff = screen.getByRole('table', { name: 'Сравнение полей предложения' });
  expect(within(diff).getAllByRole('columnheader').map((node) => node.textContent)).toEqual(['Поле', 'Было', 'Станет']);
  expect(within(diff).getAllByText('Станет').some((node) => node.classList.contains('reqai-proposal-diff__mobile-label'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  expect(acceptEnhancement).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(screen.getByRole('group', { name: 'Материалы исследования' })).getByRole('button', { name: 'Снимок требований для AI' }));
  const sourceRequirements = screen.getByRole('region', { name: 'Требования, переданные в AI-исследование' });
  expect(within(sourceRequirements).getByRole('region', { name: 'Бизнес-требования' })).toHaveClass('border-t-blue-500');
  expect(within(sourceRequirements).getByRole('region', { name: 'Функциональные требования' })).toHaveClass('border-t-violet-500');
  expect(within(sourceRequirements).getByRole('region', { name: 'Нефункциональные требования' })).toHaveClass('border-t-amber-500');
  expect(within(sourceRequirements).getByText('Что должно измениться для клиента и бизнеса')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Действия для BT-1' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'К результатам AI-исследования' }));
  expect(screen.getByRole('button', { name: 'Принять улучшение: Система должна автоматически обрабатывать заявку' })).toHaveAttribute('aria-pressed', 'true');
  const resultsHeader = screen.getByRole('heading', { name: 'Результаты AI-исследования' }).closest('header');
  expect(within(resultsHeader).queryByText('Материалы исследования')).not.toBeInTheDocument();
  fireEvent.click(within(resultsHeader).getByRole('button', { name: 'Сохранить финальную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'ri1', baseVersionId: 'base-v2', decisions: expect.objectContaining({ acceptedEnhancementKeys: ['i1:0'], rejectedEnhancementKeys: [] }) })));
  await waitFor(() => expectBusinessStage(4));
  expect(screen.getByRole('heading', { name: 'Финальная версия требований' })).toBeInTheDocument();
  const finalRequirements = screen.getByLabelText('Финальные требования по категориям');
  expect(within(finalRequirements).getByText('Система должна автоматически обрабатывать заявку')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Сохранить изменения' })).not.toBeInTheDocument();
  expect(mocks.saveRequirementsVersion.mock.calls[0][0].requirements.functional[0].text).toBe('Система должна автоматически обрабатывать заявку');
  const finalFunctional = within(finalRequirements).getByRole('region', { name: 'Функциональные требования' });
  fireEvent.click(within(finalFunctional).getByRole('button', { name: 'Действия для FT-1' }));
  fireEvent.click(within(finalFunctional).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByLabelText('Текст требования FT-1'), { target: { value: 'Система должна автоматически обрабатывать заявку за минуту' } });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenNthCalledWith(2, expect.objectContaining({ baseVersionId: 'final-v2', decisions: expect.objectContaining({ acceptedEnhancementKeys: ['i1:0'], rejectedEnhancementKeys: [] }) })));
  expect(await screen.findByText('Система должна автоматически обрабатывать заявку за минуту')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Сохранить изменения' })).not.toBeInTheDocument();
});

test('restores the original business task for a directly opened linked research job without losing research decisions', async () => {
  const content = JSON.stringify({
    mode: 'REQUIREMENTS_INSIGHTS',
    baseRequirements: { business: [{ id: 'BT-1', text: 'Сократить срок' }], functional: [], nonfunctional: [] },
    inputRequirementsVersionId: 'base-context',
    insights: [{ id: 'i-context', category: 'risks', title: 'Риск задержки', summary: 'Согласование может затянуться.', applicability: 80, enhancements: [{ targetType: 'functional', text: 'Система должна напоминать руководителю о заявке' }] }],
  });
  const originalContext = 'Автоматизировать согласование отпусков сотрудников и исключить критичные пересечения.';
  window.history.replaceState({}, '', '/tasks/research-context');
  mocks.getJob.mockImplementation(async (id) => id === 'decomposition-context'
    ? { jobId: id, type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', progress: 100, inputArtifactId: 'original-context-artifact' }
    : { jobId: 'research-context', parentJobId: 'decomposition-context', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'research-context', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', outcome: 'COMPLETE', resultArtifactId: 'research-result', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.downloadArtifact.mockResolvedValue({ text: vi.fn().mockResolvedValue(originalContext) });

  render(<AsyncJobWorkspace />);

  expect(await screen.findByText('Результаты AI-исследования')).toBeInTheDocument();
  await waitFor(() => expect(mocks.downloadArtifact).toHaveBeenCalledWith('original-context-artifact'));
  const accept = screen.getByRole('button', { name: 'Принять улучшение: Система должна напоминать руководителю о заявке' });
  fireEvent.click(accept);
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  expect(accept).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(within(screen.getByRole('group', { name: 'Материалы исследования' })).getByRole('button', { name: 'Исходная бизнес-задача' }));
  expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent(originalContext);
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  expect(screen.getByText('Результаты AI-исследования')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Принять улучшение: Система должна напоминать руководителю о заявке' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Вернуться в реестр требований' }));
  const confirmation = screen.getByRole('dialog', { name: 'Несохранённые изменения' });
  expect(within(confirmation).getByRole('button', { name: 'Сохранить финальную версию и перейти' })).toBeEnabled();
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Остаться' }));
  expect(window.location.pathname).toBe('/tasks/research-context');
  expect(screen.getByRole('button', { name: 'Принять улучшение: Система должна напоминать руководителю о заявке' })).toHaveAttribute('aria-pressed', 'true');
});

test('does not turn historical insight summaries into requirements', async () => {
  const content = JSON.stringify({ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: { business: [], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'base-old', insights: [{ id: 'old-risk', category: 'risks', title: 'Риск задержки', summary: 'Обработка может занимать больше допустимого времени.', applicability: 70 }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'ri-old', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'ri-old', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'ri-old', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', outcome: 'COMPLETE', resultArtifactId: 'ria-old', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('AI-исследование требований');
  const insightCards = await screen.findByRole('region', { name: 'Результаты AI-исследования: список и детали' });
  expect(within(insightCards).getByText('Обработка может занимать больше допустимого времени.')).toBeVisible();
  expect(within(insightCards).getByText('Аналитический вывод')).toBeVisible();
  expect(within(insightCards).queryByRole('button', { name: /Принять улучшение:/ })).not.toBeInTheDocument();
});

test('restores persisted requirements revision from history drawer', async () => {
  const content = JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: { business: [{ id: 'BT-1', text: 'Исходная версия' }], functional: [], nonfunctional: [] } }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'j5', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'j5', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'j5', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'a5', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'v5' }] });
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'v5', sourceJobId: 'j5', createdAt: new Date().toISOString(), requirements: { business: [{ id: 'BT-1', text: 'Сохранённая редакция' }], functional: [], nonfunctional: [] } });
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Подготовка требований');
  expect(await screen.findByText('Сохранённая редакция')).toBeInTheDocument();
  expect(screen.queryByText('Исходная версия')).not.toBeInTheDocument();
});

test('reviews a BABOK registry by type, preserves evidence and saves a complete edited registry', async () => {
  const registry = makeBabokRegistry();
  const job = { jobId: 'babok-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() };
  mocks.listJobs.mockResolvedValue({ items: [job], nextCursor: null });
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'babok-artifact', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify(registry));
  let revision = 0;
  mocks.saveRequirementsVersion.mockImplementation(async ({ registry: savedRegistry, baseVersionId, decisions, editedRecordIds }) => ({ versionId: `babok-v${++revision}`, sourceJobId: 'babok-job', baseVersionId, registry: savedRegistry, contentSchemaVersion: savedRegistry.schemaVersion, decisions, editedRecordIds, createdAt: new Date().toISOString() }));

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Подготовка требований');
  expect(await screen.findByRole('heading', { name: 'Требования', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Тип требований' })).toHaveValue('all');
  expect(screen.getByRole('option', { name: 'Бизнес-требования · 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Выбрать FR-001:/ })).toBeInTheDocument();
  const business = document.getElementById('record-BR-001');
  expect(within(business).getByText('Извлечено из источника')).toBeInTheDocument();
  expect(within(business).getByText('Оценка формулировки: Готово')).toBeInTheDocument();

  fireEvent.click(within(business).getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(within(business).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByLabelText('Текст требования BR-001'), { target: { value: 'Сократить время согласования заявки' } });
  fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));

  fireEvent.click(screen.getByText('Добавить требование', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Функциональные требования', exact: true }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Новое требование: FR' }), { target: { value: 'Система сохраняет историю статусов' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
  const functional = document.getElementById('record-FR-002');
  expect(within(functional).getByText('FR-002')).toBeInTheDocument();
  expect(within(functional).getByText('Система сохраняет историю статусов')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'babok-job', baseVersionId: null, registry: expect.objectContaining({ schemaVersion: 'babok-requirements.v1' }), editedRecordIds: expect.arrayContaining(['BR-001', 'FR-002']) })));
  const savedPayload = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(savedPayload.registry.groups.BR[0].text).toBe('Сократить время согласования заявки');
  expect(savedPayload.registry.groups.FR.some((item) => item.id === 'FR-002')).toBe(true);
  expect(await screen.findByRole('button', { name: 'Завершить подготовку' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Завершить подготовку' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Сохранить с открытыми вопросами' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenNthCalledWith(2, expect.objectContaining({ baseVersionId: 'babok-v1', decisions: expect.objectContaining({ skippedResearch: true }), registry: expect.any(Object) })));
  expect(await screen.findByRole('heading', { name: 'Финальная версия требований' })).toBeInTheDocument();
  expect(screen.getAllByText('Система сохраняет историю статусов')[0]).toBeInTheDocument();
});

test('reviews candidate cards individually and saves only selected requirements after failed decomposition', async () => {
  const manualRegistry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  manualRegistry.materials.primary = makeBabokRegistry().materials.primary;
  manualRegistry.scope.partial = true;
  const job = { jobId: 'manual-review', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'PARTIAL' };
  window.history.replaceState({}, '', '/tasks/manual-review');
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'artifact', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({
    mode: 'DECOMPOSITION', manualRegistry, recovery: { draft: createBabokTextDraft([
      JSON.stringify({ groups: { NFR: [{ text: 'Поиск завершается за две секунды.', category: 'Производительность', scope: 'Поиск заявок', verificationMethod: 'Нагрузочный тест', quality: 'Готово', relatedTo: ['FR-404'], source: { quote: 'Две секунды на поиск' } }] } }),
      'Непроверенная формулировка AI',
    ]) },
  }));
  mocks.saveRequirementsVersion.mockImplementation(async (body) => ({ ...body, versionId: 'manual-v1' }));

  const view = render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'На проверку · 2' })).toBeVisible();
  const [typed, plain] = screen.getAllByRole('button', { name: 'Проверить', exact: true });
  fireEvent.click(plain);
  let dialog = within(screen.getByRole('dialog', { name: 'Проверка формулировки AI' }));
  expect(dialog.getByLabelText('Тип требования')).toHaveValue('');
  expect(dialog.getByRole('button', { name: 'Добавить в реестр' })).toBeDisabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Отмена' }));
  fireEvent.click(typed);
  dialog = within(screen.getByRole('dialog', { name: 'Проверка формулировки AI' }));
  expect(dialog.getByLabelText('Тип требования')).toHaveValue('NFR');
  expect(dialog.getByLabelText('Метод проверки')).toHaveValue('Нагрузочный тест');
  expect(dialog.getByText('Две секунды на поиск')).toBeVisible();
  fireEvent.change(dialog.getByLabelText('Формулировка'), { target: { value: 'Система выполняет поиск заявок за две секунды.' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Добавить в реестр' }));
  expect(screen.getByRole('heading', { name: 'На проверку · 1' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    sourceJobId: 'manual-review', baseVersionId: null, decisions: { recoveryAdded: { 0: 'NFR-001' } }, registry: expect.objectContaining({
      groups: expect.objectContaining({ NFR: [expect.objectContaining({
        text: 'Система выполняет поиск заявок за две секунды.', category: 'Производительность',
        scope: 'Поиск заявок', verificationMethod: 'Нагрузочный тест', relatedTo: [], quality: 'Требует уточнения',
        source: expect.objectContaining({ locator: 'manual-review', quote: null }),
      })] }),
    }),
  })));
  expect(JSON.stringify(mocks.saveRequirementsVersion.mock.calls[0][0])).not.toContain('Непроверенная формулировка AI');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Завершить подготовку' })).toBeEnabled());
  expect(screen.getByRole('heading', { name: 'На проверку · 1' })).toBeVisible();
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'manual-v1' }] });
  mocks.getRequirementsVersion.mockResolvedValue({ ...mocks.saveRequirementsVersion.mock.calls[0][0], versionId: 'manual-v1' });
  view.unmount();
  sessionStorage.clear();
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('heading', { name: 'На проверку · 1' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Проверить', exact: true })).toHaveLength(1);
});

test('hides the completed recovery queue and shows all requirement types in the registry', async () => {
  const draft = roomBookingRegistry();
  const manualRegistry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  manualRegistry.materials = draft.materials;
  manualRegistry.scope.partial = true;
  const job = { jobId: 'finished-queue', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'PARTIAL' };
  window.history.replaceState({}, '', '/tasks/finished-queue');
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'artifact', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({
    mode: job.mode, manualRegistry, recovery: { draft: createBabokTextDraft([JSON.stringify(draft)]) },
  }));

  render(<AsyncJobWorkspace />);
  const queue = within(await screen.findByRole('region', { name: 'Формулировки AI на проверку' }));
  for (const remaining of [3, 2, 1]) {
    expect(queue.getByRole('heading', { name: `На проверку · ${remaining}` })).toBeVisible();
    fireEvent.click(queue.getAllByRole('button', { name: 'Проверить', exact: true })[0]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Проверка формулировки AI' })).getByRole('button', { name: 'Добавить в реестр' }));
    if (remaining === 3) fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'BR' } });
  }
  expect(screen.queryByRole('region', { name: 'Формулировки AI на проверку' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Тип требований' })).toHaveValue('all');
  const registry = within(screen.getByRole('navigation', { name: 'Список требований' }));
  expect(registry.getAllByRole('button', { name: /^Выбрать / })).toHaveLength(3);
  expect(registry.getByRole('button', { name: /^Выбрать FR-002:/ })).toHaveAttribute('aria-pressed', 'true');
});

test.each([false, true])('finalizes the saved input after failed linked research without requiring edits (BABOK: %s)', async (babok) => {
  const job = { jobId: 'research-recovery', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'PARTIAL', inputArtifactId: 'input-version' };
  const requirements = { business: [{ id: 'BT-1', text: 'Сократить срок рассмотрения' }], functional: [], nonfunctional: [] };
  const registry = babok ? makeBabokRegistry() : undefined;
  window.history.replaceState({}, '', '/tasks/research-recovery');
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'artifact', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: job.mode, inputRequirementsVersionId: 'input-version', insights: [], recovery: { reasonCode: 'BABOK_SEMANTIC_INVALID' } }));
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'input-version', requirements, registry, decisions: {}, createdAt: '2026-11-18T08:00:00Z' });
  mocks.saveRequirementsVersion.mockImplementation(async (body) => ({ ...body, versionId: 'final-version' }));

  render(<AsyncJobWorkspace />);
  expect(await screen.findByText(/Продолжите с сохранёнными требованиями/)).toBeInTheDocument();
  if (babok) expect(document.getElementById('record-BR-001')).toHaveTextContent('Сократить время согласования');
  else expect(screen.getByText('Сократить срок рассмотрения')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    sourceJobId: 'research-recovery', baseVersionId: 'input-version', ...(babok ? { registry } : { requirements }),
  })));
});

test.each([false, true])('keeps BABOK target types and original decision indices when filtering unsupported proposals: %s', async (unsupportedFirst) => {
  const baseRegistry = makeBabokRegistry();
  const expectedKey = `babok-insight:${unsupportedFirst ? 1 : 0}`;
  const content = JSON.stringify({
    mode: 'REQUIREMENTS_INSIGHTS', baseRegistry, baseRequirements: { business: [], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'babok-base',
    babokIdentifierSet: ['BR-001', 'SR-001', 'FR-001', 'NFR-001', 'TR-001', 'CON-001'],
    insights: [{ id: 'babok-insight', category: 'patterns', title: 'История статусов', summary: 'Прозрачность состояния снижает число повторных обращений.', detail: 'Практика полезна для процесса согласования.', applicability: 85, source_types: ['industry_report'], relatedTo: ['FR-001'], enhancements: [...(unsupportedFirst ? [{ targetType: 'unsupported', text: 'Неподдерживаемое предложение' }] : []), { targetType: 'FR', targetIds: ['FR-001'], text: 'Система хранит историю статусов заявки' }] }],
  });
  const job = { jobId: 'babok-research', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() };
  mocks.listJobs.mockResolvedValue({ items: [job], nextCursor: null });
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'babok-research-artifact', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.saveRequirementsVersion.mockImplementation(async ({ registry, baseVersionId, decisions }) => ({ versionId: 'babok-final', sourceJobId: 'babok-research', baseVersionId, registry, decisions, createdAt: new Date().toISOString() }));

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('AI-исследование требований');
  expect(await screen.findByText('Результаты AI-исследования')).toBeInTheDocument();
  const card = screen.getByRole('article');
  expect(within(card).getAllByRole('button', { name: 'FR-001' })).toHaveLength(2);
  expect(within(card).getByText('Система хранит историю статусов заявки')).toBeVisible();
  fireEvent.click(within(card).getByRole('button', { name: 'Принять улучшение: Система хранит историю статусов заявки' }));
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  fireEvent.click(within(card).getAllByRole('button', { name: 'FR-001' })[0]);
  const requirementPreview = await screen.findByRole('dialog', { name: /Функциональное требование · FR-001/ });
  expect(requirementPreview).toHaveTextContent('Система показывает статус заявки');
  fireEvent.click(within(requirementPreview).getByRole('button', { name: 'Закрыть предпросмотр требования' }));
  expect(await screen.findByText('Выбрано улучшений: 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Сохранить с открытыми вопросами' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'babok-base', decisions: expect.objectContaining({ acceptedEnhancementKeys: [expectedKey], rejectedEnhancementKeys: [] }), registry: expect.any(Object) })));
  const saved = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(saved.registry.groups.FR).toEqual(expect.arrayContaining([expect.objectContaining({ researchEnhancementKey: expectedKey, fromResearch: true, relatedTo: [] })]));
  expect(saved.registry.analysis.traceability).toContainEqual(expect.objectContaining({ to: 'FR-001', status: 'Предполагается' }));
  expect(await screen.findByRole('heading', { name: 'Финальная версия требований' })).toBeInTheDocument();
  expect(screen.getByText('Система хранит историю статусов заявки')).toBeInTheDocument();
});

test('opens retained legacy results as read-only archives without retry controls', async () => {
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'r1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'r1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100, createdAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  mocks.getResult.mockResolvedValue({ jobId: 'r1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', outcome: 'COMPLETE', summary: 'Сохранённая сводка', resultArtifactId: 'ra1', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue('{"sensitive":"legacy payload"}');
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Архивная задача');
  expect(await screen.findByRole('heading', { name: 'Результат старой версии' })).toBeInTheDocument();
  expect(screen.getByText('Сохранённая сводка')).toBeInTheDocument();
  expect(screen.getByText('AGENT_RESEARCH')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Скачать артефакт' })).toBeInTheDocument();
  expect(screen.queryByText('sensitive')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Повторить|Retry/ })).not.toBeInTheDocument();
});

test('collapses the business context form when decomposition starts and allows reopening it', async () => {
  mocks.uploadArtifact.mockResolvedValue({ artifactId: 'context-artifact' });
  mocks.decomposeRequirements.mockResolvedValue({ jobId: 'running-decomposition' });
  mocks.getJob.mockResolvedValue({ jobId: 'running-decomposition', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 10 });
  render(<AsyncJobWorkspace />);
  await screen.findByLabelText('Предыдущая версия требований');

  fireEvent.change(screen.getByRole('textbox', { name: 'Бизнес-контекст' }), { target: { value: 'Сократить время обработки' } });
  fireEvent.click(screen.getByRole('button', { name: 'Декомпозировать требования' }));

  await screen.findByRole('region', { name: 'Выполнение задачи' });
  const expandButton = screen.getByRole('button', { name: 'Развернуть форму бизнес-задачи' });
  expect(expandButton).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox', { name: 'Бизнес-контекст' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Выполнение задачи' })).toBeInTheDocument();

  fireEvent.click(expandButton);
  expect(screen.getByRole('button', { name: 'Свернуть форму бизнес-задачи' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toBeDisabled();
});

test('warns before unload and discards a dirty review when starting a new task', async () => {
  await openSavedRoomReview({ title: 'Бронирование переговорных' });
  expect(screen.getByRole('region', { name: 'Название задачи' })).toHaveTextContent('Бронирование переговорных');

  const beforeUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Подготовка требований' }));
  expect(screen.getByRole('dialog', { name: 'Несохранённые изменения' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отбросить и перейти' }));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toHaveValue('');
});

test('downloads a result artifact from the accessible Debug panel', async () => {
  const artifact = new Blob(['{"ok":true}'], { type: 'application/json' });
  mocks.downloadArtifact.mockResolvedValue(artifact);
  const createObjectURL = vi.fn(() => 'blob:reqai-result');
  const revokeObjectURL = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  try {
    await openSavedRoomReview({ title: 'Скачать результат' });
    (await screen.findByRole('button', { name: 'Ещё ▾' })).parentElement.open = true;
    expect(screen.getByRole('button', { name: 'Скачать DOCX' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Журнал задачи' }));
    const dialog = await screen.findByRole('dialog', { name: 'Журнал задачи' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Скачать результат JSON' }));
    await waitFor(() => expect(mocks.downloadArtifact).toHaveBeenCalledWith('rooms-result'));
    expect(createObjectURL).toHaveBeenCalledWith(artifact);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:reqai-result');
    expect(anchorClick).toHaveBeenCalled();
  } finally {
    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  }
});

test('resets the workspace and refreshes identity after an auth change event', async () => {
  await openSavedRoomReview();
  window.dispatchEvent(new Event('reqai:auth-changed'));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(await screen.findByRole('textbox', { name: 'Бизнес-контекст' })).toBeInTheDocument();
  expect(screen.queryByText('Сохранить мой черновик.')).not.toBeInTheDocument();
});

test('surfaces capability failures during workspace initialization', async () => {
  mocks.getCapabilities.mockRejectedValueOnce(new Error('Не удалось загрузить возможности'));
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить возможности');
});

test('keeps a result usable when its source artifact expired', async () => {
  window.history.replaceState({}, '', '/tasks/expired-source');
  const job = { jobId: 'expired-source', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', inputArtifactId: 'expired-artifact' };
  const requirements = { business: [{ id: 'BT-1', text: 'Цель из результата' }], functional: [], nonfunctional: [] };
  mocks.getCapabilities.mockResolvedValue({ capabilities: { models: ['GC-Max'] } });
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'result-artifact' });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: requirements }] }));
  mocks.downloadArtifact.mockRejectedValue(new Error('Срок хранения истёк'));
  render(<AsyncJobWorkspace />);
  await waitFor(() => expect(mocks.getJob).toHaveBeenCalledWith('expired-source', expect.any(Object)));
  await waitFor(() => expect(mocks.getResult).toHaveBeenCalledWith('expired-source', expect.any(Object)));
  await waitFor(() => expect(mocks.getResultContent).toHaveBeenCalledWith('expired-source'));
  expect(await screen.findByText('Цель из результата')).toBeInTheDocument();
  await waitFor(() => expect(mocks.downloadArtifact).toHaveBeenCalledWith('expired-artifact'));
});

test('shows a non-success completion notification for a remembered background job', async () => {
  const failed = { jobId: 'background-failed', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'FAILED', reasonCode: 'NO_USABLE_OUTPUT', outcome: 'FAILED' };
  localStorage.setItem('reqai.backgroundJob', failed.jobId);
  mocks.listJobs.mockResolvedValue({ items: [failed], nextCursor: null });
  render(<AsyncJobWorkspace />);

  const notice = await screen.findByRole('status', { name: 'Задача завершена' });
  expect(within(notice).getByText('Не выполнено')).toBeInTheDocument();
  expect(within(notice).getByText('Исследование')).toBeInTheDocument();
  fireEvent.click(within(notice).getByRole('button', { name: 'Закрыть уведомление' }));
  expect(screen.queryByRole('status', { name: 'Задача завершена' })).not.toBeInTheDocument();
});

test('reconciles a background job even when another job owns the storage marker', async () => {
  const running = { jobId: 'background-running', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', progress: 45 };
  const completed = { ...running, status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 };
  localStorage.setItem('reqai.backgroundJob', 'another-job');
  mocks.listJobs.mockResolvedValue({ items: [running], nextCursor: null });
  mocks.getJob.mockResolvedValue(completed);
  render(<AsyncJobWorkspace />);

  expect(await screen.findByRole('status', { name: 'Задача завершена' })).toBeInTheDocument();
  expect(localStorage.getItem('reqai.backgroundJob')).toBe('another-job');
});

test('hydrates historical research decisions from the source requirements version', async () => {
  window.history.replaceState({}, '', '/tasks/hydrated-research');
  const job = { jobId: 'hydrated-research', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE' };
  const content = JSON.stringify({ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: { business: [], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'source-version', insights: [] });
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'research-artifact' });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.listRequirementsVersions.mockResolvedValue({ items: [] });
  mocks.getRequirementsVersion.mockResolvedValue({ versionId: 'source-version', decisions: { review: { schemaVersion: 1 } } });
  render(<AsyncJobWorkspace />);

  expect(await screen.findByText('Результаты AI-исследования')).toBeInTheDocument();
  await waitFor(() => expect(mocks.getRequirementsVersion).toHaveBeenCalledWith('source-version'));
});

test('keeps a remote-version conflict available for explicit comparison', async () => {
  await openSavedRoomReview();
  const remote = roomBookingRegistry();
  remote.groups.FR[0].text = 'Новая версия на сервере';
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'rooms-remote', sourceJobId: 'rooms', registry: remote, requirements: {}, decisions: {}, createdAt: new Date().toISOString() }] });
  mocks.saveRequirementsVersion.mockRejectedValue(Object.assign(new Error('stale revision'), { code: 'REQUIREMENTS_VERSION_CONFLICT' }));

  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  expect(await screen.findByText('На сервере появилась новая версия. Сравните её с вашими правками перед сохранением.')).toBeInTheDocument();
  await waitFor(() => expect(mocks.listRequirementsVersions).toHaveBeenCalledWith('rooms'));
  expect(screen.getByRole('button', { name: 'Загрузить новую версию' })).toBeInTheDocument();
});

test('reports when the server accepts a save without returning a version id', async () => {
  await openSavedRoomReview();
  mocks.saveRequirementsVersion.mockResolvedValue({});

  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие');
});

test('tracks an empty reference selection without inventing a context draft', async () => {
  mocks.getCapabilities.mockResolvedValue({ capabilities: { models: ['glm-5.3-flash'], domainOperations: ['decomposition'] } });
  render(<AsyncJobWorkspace />);
  fireEvent.click(screen.getByText('Приложить материалы'));
  fireEvent.change(await screen.findByLabelText('Справочные материалы'), { target: { files: [] } });
  expect(screen.queryByRole('button', { name: 'К черновику новой задачи' })).not.toBeInTheDocument();
});

test('guards a browser route change while a review draft is dirty', async () => {
  await openSavedRoomReview();
  mocks.getJob.mockResolvedValue({ jobId: 'next-job', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'RUNNING', progress: 5 });
  await screen.findByRole('button', { name: 'Сохранить черновик' });

  await act(() => {
    window.history.pushState({}, '', '/tasks/next-job');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });
  expect(screen.getByRole('dialog', { name: 'Несохранённые изменения' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отбросить и перейти' }));
  await waitFor(() => expect(window.location.pathname).toBe('/tasks/next-job'));
  expect(await screen.findByRole('heading', { name: 'Результат старой версии' })).toBeInTheDocument();
});

test('cancels an active job and surfaces a safe error when cancellation fails', async () => {
  const job = { jobId: 'cancel-failure', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 12 };
  localStorage.setItem('reqai.activeJob', job.jobId);
  mocks.getJob.mockResolvedValue(job);
  mocks.cancelJob.mockRejectedValue(new Error('cancel network failure'));
  render(<AsyncJobWorkspace />);

  fireEvent.click(await screen.findByRole('button', { name: 'Отменить' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие');
  expect(mocks.cancelJob).toHaveBeenCalledWith(job.jobId);
});

test('asks before leaving a dirty final research review and preserves the saved view flow', async () => {
  const requirements = { business: [{ id: 'BT-1', text: 'Исходная цель' }], functional: [], nonfunctional: [] };
  const job = { jobId: 'final-navigation', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100, createdAt: new Date().toISOString() };
  const version = { versionId: 'final-navigation-v1', sourceJobId: job.jobId, requirements, decisions: {}, createdAt: new Date().toISOString() };
  mocks.listJobs.mockResolvedValue({ items: [job], nextCursor: null });
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'final-navigation-artifact' });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: requirements, insights: [] }));
  mocks.listRequirementsVersions.mockResolvedValue({ items: [version] });

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('AI-исследование требований');
  expect(await screen.findByRole('heading', { name: 'Финальная версия требований' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BT-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BT-1' }), { target: { value: 'Изменённая цель' } });
  fireEvent.click(screen.getByRole('button', { name: 'К результатам AI-исследования' }));
  expect(screen.getByRole('dialog', { name: 'Несохранённые изменения' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отбросить и перейти' }));
  await waitFor(() => expect(screen.getByText('Результаты AI-исследования')).toBeInTheDocument());
  expect(screen.queryByText('Изменённая цель')).not.toBeInTheDocument();
});

for (const status of ['FAILED', 'CANCELLED']) test(`${status} research can restart its saved version without another decomposition`, async () => {
  window.history.replaceState({}, '', '/tasks/research-retry');
  const failed = { jobId: 'research-retry', parentJobId: 'requirements-parent', inputArtifactId: 'saved-version', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status };
  mocks.getJob.mockImplementation(async (id) => id === failed.jobId ? failed : id === 'requirements-parent'
    ? { jobId: id, type: 'DECOMPOSITION', status: 'SUCCEEDED', inputArtifactId: 'source' }
    : { jobId: id, parentJobId: 'requirements-parent', inputArtifactId: 'saved-version', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING' });
  mocks.downloadArtifact.mockResolvedValue({ text: async () => 'Исходная бизнес-задача' });
  let accept;
  mocks.researchRequirements.mockImplementation(() => new Promise((resolve) => { accept = resolve; }));
  render(<AsyncJobWorkspace />);
  const retry = await screen.findByRole('button', { name: 'Повторить исследование' });
  expect(screen.queryByRole('button', { name: 'Декомпозировать требования' })).not.toBeInTheDocument();
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(screen.getByRole('button', { name: 'Запускаем исследование…' })).toBeDisabled();
  expect(mocks.researchRequirements).toHaveBeenCalledTimes(1);
  expect(mocks.researchRequirements).toHaveBeenCalledWith('saved-version', expect.objectContaining({ model: expect.any(String) }), expect.any(String));
  expect(mocks.decomposeRequirements).not.toHaveBeenCalled();
  await act(async () => accept({ jobId: 'research-restarted' }));
  await waitFor(() => expect(window.location.pathname).toBe('/tasks/research-restarted'));
});

test('retry research preserves its idempotency key after a network failure', async () => {
  window.history.replaceState({}, '', '/tasks/retry-network');
  mocks.getJob.mockResolvedValue({ jobId: 'retry-network', inputArtifactId: 'same-version', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'FAILED' });
  mocks.researchRequirements.mockRejectedValue(new Error('network failure'));
  render(<AsyncJobWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Повторить исследование' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Повторить исследование' })).toBeEnabled();
  const first = mocks.researchRequirements.mock.calls[0];
  fireEvent.click(screen.getByLabelText('Настройки AI'));
  fireEvent.click(screen.getByRole('switch', { name: 'Независимая проверка (критик)' }));
  expect(first[1].criticEnabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Повторить исследование' }));
  await waitFor(() => expect(mocks.researchRequirements).toHaveBeenCalledTimes(2));
  expect(mocks.researchRequirements.mock.calls[1]).toEqual(first);
});

test('new task text survives remount and clearing removes the saved draft', async () => {
  mocks.getCapabilities.mockResolvedValue({ tenantId: 'draft-tenant', userId: 'draft-user', capabilities: {} });
  const first = render(<AsyncJobWorkspace />);
  await screen.findByRole('textbox', { name: 'Бизнес-контекст' });
  await waitFor(() => expect(mocks.getCapabilities).toHaveBeenCalled());
  fireEvent.change(screen.getByRole('textbox', { name: 'Бизнес-контекст' }), { target: { value: 'Дистанционная заявка на изменение кредита' } });
  first.unmount();
  render(<AsyncJobWorkspace />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toHaveValue('Дистанционная заявка на изменение кредита'));
  expect(screen.getByText('Черновик восстановлен на этом устройстве.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Удалить черновик' }));
  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toHaveValue('');
  expect(localStorage.getItem('reqai.contextDraft:["draft-tenant","draft-user"]')).toBeNull();
});
