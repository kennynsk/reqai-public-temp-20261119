// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(), getJob: vi.fn(), getResult: vi.fn(), getResultContent: vi.fn(), getCapabilities: vi.fn(),
  uploadArtifact: vi.fn(), createJob: vi.fn(), researchRequirements: vi.fn(), cancelJob: vi.fn(), downloadArtifact: vi.fn(), getJobTrace: vi.fn(), getJobTraceDetail: vi.fn(),
  listRequirementsVersions: vi.fn(), getRequirementsVersion: vi.fn(), saveRequirementsVersion: vi.fn(), subscribe: vi.fn(),
}));

vi.mock('./api/enterprise-api.js', () => ({
  enterpriseApi: {
    listJobs: mocks.listJobs, getJob: mocks.getJob, getResult: mocks.getResult, getResultContent: mocks.getResultContent,
    getCapabilities: mocks.getCapabilities, uploadArtifact: mocks.uploadArtifact, createJob: mocks.createJob,
    researchRequirements: mocks.researchRequirements,
    cancelJob: mocks.cancelJob, downloadArtifact: mocks.downloadArtifact, listRequirementsVersions: mocks.listRequirementsVersions,
    getRequirementsVersion: mocks.getRequirementsVersion, saveRequirementsVersion: mocks.saveRequirementsVersion,
    getJobTrace: mocks.getJobTrace, getJobTraceDetail: mocks.getJobTraceDetail,
  },
  subscribeJobEvents: mocks.subscribe,
}));

import AsyncJobWorkspace from './AsyncJobWorkspace.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';

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
  mocks.getCapabilities.mockResolvedValue({ capabilities: { models: ['GC-Max', 'GC-M', 'GC-Lite'] } });
  mocks.getJobTrace.mockResolvedValue({ jobId: 'job', status: 'RUNNING', createdAt: new Date().toISOString(), durationMs: null, timeline: [], nextCursor: null });
  mocks.subscribe.mockResolvedValue();
});
afterEach(cleanup);

async function openSavedRoomReview() {
  const registry = roomBookingRegistry();
  const job = { jobId: 'rooms', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED' };
  window.history.replaceState({}, '', '/tasks/rooms');
  localStorage.setItem('reqai.requirementsLayout', 'rows');
  mocks.getJob.mockResolvedValue(job);
  mocks.getResult.mockResolvedValue({ ...job, resultArtifactId: 'rooms-result' });
  mocks.getResultContent.mockResolvedValue(JSON.stringify(registry));
  mocks.listRequirementsVersions.mockResolvedValue({ items: [{ versionId: 'rooms-v1', sourceJobId: 'rooms', registry, requirements: {}, decisions: {}, createdAt: '2026-08-28T10:00:00Z' }] });
  render(<AsyncJobWorkspace />);
  await screen.findByText('Сократить конфликты бронирования.');
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: 'Сохранить мой черновик.' } });
}

test('keeps an open BABOK draft across type switches', async () => {
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('tab', { name: 'FR · Функциональные требования' }));
  fireEvent.click(screen.getByRole('tab', { name: 'BR · Бизнес-требования' }));
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
});

test('does not advertise a pending BABOK draft as saved or eligible for research', async () => {
  await openSavedRoomReview();
  expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument();
  expect(screen.queryByText(/^Сохранено ·/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Улучшить требования с помощью AI' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Перейти к финальной версии' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeEnabled();
});

test('global save includes an open card draft and retains it after failure', async () => {
  mocks.saveRequirementsVersion.mockRejectedValue(new Error('Сеть недоступна'));
  await openSavedRoomReview();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    clientMutationId: expect.any(String), expectedLatestVersionId: 'rooms-v1',
    registry: expect.objectContaining({ groups: expect.objectContaining({ BR: [expect.objectContaining({ text: 'Сохранить мой черновик.' })] }) }),
  })));
  await screen.findByText(/Сеть недоступна/);
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
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

test('offers same-tab recovery after reload and clears it after a confirmed save', async () => {
  mocks.getCapabilities.mockResolvedValue({ tenantId: 'tenant', userId: 'user', capabilities: { models: ['glm-5.3-flash'] } });
  mocks.saveRequirementsVersion.mockImplementation(async (payload) => ({ ...payload, versionId: 'rooms-v2', createdAt: '2026-08-28T11:00:00Z' }));
  await openSavedRoomReview();
  const key = 'reqai.reviewDraft:["tenant","user"]:rooms';
  await waitFor(() => expect(sessionStorage.getItem(key)).toContain('Сохранить мой черновик.'));
  cleanup();
  render(<AsyncJobWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Восстановить черновик' }));
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Сохранить мой черновик.');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  await screen.findByText('Сохранить мой черновик.');
  expect(sessionStorage.getItem(key)).toBeNull();
});

test('global validation reveals an invalid field hidden in another type', async () => {
  await openSavedRoomReview();
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('tab', { name: 'FR · Функциональные требования' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
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
  fireEvent.click(screen.getByRole('tab', { name: 'FR · Функциональные требования' }));
  expect(screen.getByText('Правка второго клиента')).toBeInTheDocument();
  mocks.saveRequirementsVersion.mockRejectedValue(new Error('Test offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ expectedLatestVersionId: 'rooms-v2' })));
});

test('saves structured changes and original evidence together without closing the card', async () => {
  await openSavedRoomReview();
  fireEvent.change(screen.getByRole('textbox', { name: 'Критерий успеха BR-001' }), { target: { value: 'Не более двух конфликтов в месяц' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Качество BR-001' }), { target: { value: 'Готово' } });
  mocks.saveRequirementsVersion.mockRejectedValue(new Error('Test offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
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
  expect(screen.getByText('Сократить конфликты бронирования.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
  fireEvent.click(screen.getByRole('button', { name: 'Добавить требование' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Новое требование: BR' }), { target: { value: 'Новая цель' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
  expect(screen.getByText('BR-002')).toBeInTheDocument();
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
  expect(screen.getByRole('button', { name: 'Debug' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Debug' })).toHaveAttribute('title', 'Debug станет доступен после запуска задачи');
  expect(await screen.findByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: 'Подготовка требований' })).toBeInTheDocument();
  const steps = screen.getByRole('list', { name: 'Этапы подготовки требований' });
  expect(within(steps).getByText('Контекст')).toBeInTheDocument();
  expect(within(steps).getByText('AI-исследование')).toBeInTheDocument();
  expect(screen.getByText('Необязательный шаг')).toBeInTheDocument();
  expectBusinessStage(1);
  expect(screen.getByText('Настройки AI')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Модель', hidden: true })).not.toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Reasoning', hidden: true })).not.toBeVisible();
  expect(screen.queryByText('Декомпозиция ещё не выполнена')).not.toBeInTheDocument();
});

test('allows choosing a reasoning level and sends it with a new task', async () => {
  mocks.uploadArtifact.mockResolvedValue({ artifactId: 'artifact-1' });
  mocks.createJob.mockResolvedValue({ jobId: 'job-1' });
  render(<AsyncJobWorkspace />);
  fireEvent.click(screen.getByText('Настройки AI').closest('summary'));
  const reasoning = screen.getByRole('combobox', { name: 'Reasoning' });
  expect(reasoning).toHaveValue('disabled');
  fireEvent.change(reasoning, { target: { value: 'high' } });
  fireEvent.change(screen.getByPlaceholderText('Опишите бизнес-задачу...'), { target: { value: 'Сократить время обработки' } });
  fireEvent.click(screen.getByRole('button', { name: 'Декомпозировать требования' }));
  await waitFor(() => expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ reasoning: 'high' }) })));
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

  expect(await screen.findByText('Сопоставляем требования с отраслевыми практиками')).toBeInTheDocument();
  const estimatedProgress = screen.getByRole('progressbar', { name: 'Прогресс выполнения задачи' });
  expect(Number(estimatedProgress.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  expect(Number(estimatedProgress.getAttribute('aria-valuenow'))).toBeLessThan(90);
  expect(estimatedProgress).toHaveAttribute('aria-valuetext', expect.stringContaining('Оценка'));
  expectBusinessStage(3);
  expect(screen.getByRole('listitem', { name: 'Подготовка: завершено' })).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'AI-анализ: выполняется' })).toHaveAttribute('aria-current', 'step');
  expect(screen.queryByText(/Сейчас в фокусе:/)).not.toBeInTheDocument();
  expect(screen.getByText(/обычно 3–6 минут/)).toBeInTheDocument();
  expect(screen.getByLabelText('Об ориентировочной оценке прогресса')).toHaveAttribute('title', 'Процент — ориентировочная оценка. Переходы между этапами подтверждаются сервером.');
  expect(screen.getByLabelText(/Прошло 00:1[12]/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Продолжить в фоне' }));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  const indicator = await screen.findByRole('button', { name: 'Фоновая задача: AI анализирует требования' });
  expect(Number(indicator.textContent.match(/(\d+)%/)?.[1])).toBeGreaterThan(20);
  expect(screen.queryByRole('region', { name: 'Выполнение задачи' })).not.toBeInTheDocument();

  fireEvent.click(indicator);
  await waitFor(() => expect(window.location.pathname).toBe('/tasks/honest-1'));
  expect(await screen.findByText('Сопоставляем требования с отраслевыми практиками')).toBeInTheDocument();
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
  expect(screen.getByRole('listitem', { name: 'AI-анализ: выполняется' })).toBeInTheDocument();

  const assembly = { ...running, progress: 90, currentStep: 'assembly', message: 'Собираем требования по категориям', updatedAt: new Date(Date.now() - 30_000).toISOString() };
  await waitFor(() => expect(onEvent).toBeTypeOf('function'));
  await act(() => onEvent({ jobId: running.jobId, eventType: 'job.progress', job: assembly }));
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(90);
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeLessThan(95);
  expect(progress).toHaveAttribute('aria-valuetext', expect.stringMatching(/Оценка \d+ процентов, этап Сборка/));
  expect(screen.getByText(/\d+% · Сборка/)).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'AI-анализ: завершено' })).toBeInTheDocument();
  expect(screen.getByRole('listitem', { name: 'Сборка: выполняется' })).toHaveAttribute('aria-current', 'step');

  mocks.getJob.mockResolvedValue(assembly);
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить в фоне' }));
  const indicator = await screen.findByRole('button', { name: 'Фоновая задача: Собираем требования по категориям. Этап: Сборка' });
  expect(indicator.textContent).toMatch(/9[1-4]%/);
});

test('shows a realistic decomposition duration without warning before the expected window ends', async () => {
  const running = {
    jobId: 'duration-1', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 20,
    currentStep: 'model', message: 'AI формирует структуру требований', startedAt: new Date(Date.now() - 239_000).toISOString(),
  };
  localStorage.setItem('reqai.activeJob', running.jobId);
  mocks.getJob.mockResolvedValue(running);
  render(<AsyncJobWorkspace />);

  expect(await screen.findByText(/обычно 2–4 минуты/)).toBeInTheDocument();
  expect(screen.queryByText('Обработка занимает больше обычного, но задача продолжает выполняться.')).not.toBeInTheDocument();
});

test('explains a decomposition run that exceeds the four-minute estimate', async () => {
  const running = {
    jobId: 'duration-2', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 95,
    currentStep: 'persistence', message: 'Сохраняем требования', startedAt: new Date(Date.now() - 241_000).toISOString(), updatedAt: new Date(Date.now() - 30_000).toISOString(),
  };
  localStorage.setItem('reqai.activeJob', running.jobId);
  mocks.getJob.mockResolvedValue(running);
  render(<AsyncJobWorkspace />);

  expect(await screen.findByText('Обработка занимает больше обычного, но задача продолжает выполняться.')).toBeInTheDocument();
  const progress = screen.getByRole('progressbar', { name: 'Прогресс выполнения задачи' });
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(95);
  expect(Number(progress.getAttribute('aria-valuenow'))).toBeLessThan(100);
  expect(progress).toHaveAttribute('aria-valuetext', expect.stringMatching(/Оценка \d+ процентов, этап Сохранение/));
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

test('opens compact history drawer, filters jobs and renders localized partial status', async () => {
  mocks.listJobs.mockResolvedValue({ items: [
    { jobId: 'j2', type: 'RESEARCH', mode: 'STANDARD_RESEARCH', status: 'SUCCEEDED', outcome: 'PARTIAL', createdAt: new Date().toISOString() },
    { jobId: 'd2', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() },
  ], nextCursor: null });
  render(<AsyncJobWorkspace />);
  const visibleDrawer = await openHistory();
  expect(within(visibleDrawer).getByText('Готово частично')).toBeInTheDocument();
  fireEvent.click(within(visibleDrawer).getByRole('button', { name: 'Декомпозиция' }));
  expect(within(visibleDrawer).queryByText('Исследование', { exact: true })).not.toBeInTheDocument();
  expect(within(visibleDrawer).getByText('Подготовка требований', { exact: true })).toBeInTheDocument();
});

test('cancels active job and reconciles authoritative REST state', async () => {
  mocks.getJob.mockResolvedValueOnce({ jobId: 'j3', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', progress: 10 })
    .mockResolvedValueOnce({ jobId: 'j3', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'CANCEL_REQUESTED', progress: 10 });
  localStorage.setItem('reqai.activeJob', 'j3');
  mocks.cancelJob.mockResolvedValue({});
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('button', { name: 'Декомпозиция выполняется…' })).toBeDisabled();
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

test('saves reviewed decomposition and starts linked research inside requirements workspace', async () => {
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
  expect(await screen.findByRole('heading', { name: 'Проверка требований' })).toBeInTheDocument();
  expect(screen.getByText('Этап 2 из 4')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Этапы подготовки требований' })).toBeInTheDocument();
  expectBusinessStage(2);
  const contextSummary = screen.getByLabelText('Исходный бизнес-контекст');
  expect(contextSummary.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByPlaceholderText('Опишите бизнес-задачу...')).not.toBeVisible();
  expect(screen.queryByText('Результат задачи')).not.toBeInTheDocument();
  fireEvent.click(contextSummary);
  expect(screen.getByPlaceholderText('Опишите бизнес-задачу...')).toBeVisible();
  const researchButton = screen.getByRole('button', { name: 'Улучшить требования с помощью AI' });
  expect(researchButton).toBeDisabled();
  expect(researchButton.closest('.sticky')).toHaveClass('top-16');
  expect(screen.queryByRole('tablist', { name: 'Категории требований' })).not.toBeInTheDocument();
  const businessColumn = screen.getByRole('region', { name: 'Бизнес-требования' });
  const functionalColumn = screen.getByRole('region', { name: 'Функциональные требования' });
  const nonfunctionalColumn = screen.getByRole('region', { name: 'Нефункциональные требования' });
  expect(within(businessColumn).getByText('Снизить срок обработки')).toBeInTheDocument();
  expect(within(functionalColumn).getByText('Автоматизировать проверку')).toBeInTheDocument();
  expect(within(nonfunctionalColumn).getByText('Нет сформированных требований')).toBeInTheDocument();
  expect(screen.queryByLabelText('Новое требование: Бизнес-требования')).not.toBeInTheDocument();
  fireEvent.click(within(functionalColumn).getByRole('button', { name: 'Добавить требование' }));
  expect(screen.getByLabelText('Новое требование: Функциональные требования')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.queryByLabelText('Новое требование: Функциональные требования')).not.toBeInTheDocument();
  fireEvent.click(within(businessColumn).getByRole('button', { name: 'Действия для BT-1' }));
  fireEvent.click(within(businessColumn).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByLabelText('Текст требования BT-1'), { target: { value: 'Снизить срок обработки до одного дня' } });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
  expect(screen.getByRole('button', { name: 'Сохранить проверенную версию' })).toHaveClass('bg-indigo-600');
  expect(researchButton).not.toHaveClass('bg-emerald-600');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить проверенную версию' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Улучшить требования с помощью AI' })).toBeEnabled());
  expect(screen.getByText(/Сохранено ·/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Улучшить требования с помощью AI' }));
  await waitFor(() => expect(mocks.researchRequirements).toHaveBeenCalledWith('version-1', { model: 'GC-Max', temperature: 0.2, reasoning: 'disabled' }));
  expect(await screen.findByRole('heading', { name: 'AI-исследование требований' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  expect(mocks.researchRequirements).toHaveBeenCalledTimes(1);
  expect(mocks.saveRequirementsVersion).toHaveBeenCalledTimes(1);
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
  expect(categories).toHaveClass('xl:grid-cols-3');
  const layoutToggle = screen.getByRole('group', { name: 'Вид требований' });
  fireEvent.click(within(layoutToggle).getByRole('button', { name: 'Строки' }));
  expect(categories).toHaveClass('grid-cols-1');
  expect(categories).not.toHaveClass('xl:grid-cols-3');
  expect(localStorage.getItem('reqai.requirementsLayout')).toBe('rows');

  fireEvent.click(screen.getByRole('button', { name: 'Перейти к финальной версии' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({
    sourceJobId: 'j-skip',
    baseVersionId: 'reviewed-v1',
    decisions: { skippedResearch: true },
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
  localStorage.setItem('reqai.viewedJob', 'parent-job');
  mocks.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  mocks.getJob.mockImplementation(async (id) => id === 'research-job'
    ? { jobId: 'research-job', parentJobId: 'parent-job', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', progress: 20 }
    : { jobId: 'parent-job', type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'parent-job', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'artifact-parent', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: requirementsValue }] }));
  mocks.subscribe.mockImplementation((jobId, options) => { onEvent = options.onEvent; return Promise.resolve(); });
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
  const trigger = await screen.findByRole('button', { name: 'Debug' });
  await waitFor(() => expect(trigger).toBeEnabled());
  await waitFor(() => expect(onObservation).toBeTypeOf('function'));
  expect(screen.queryByText('Техническая информация')).not.toBeInTheDocument();
  await act(() => onObservation({ type: 'reconnect', jobId: 'debug-job', cursor: 1, timestamp: new Date().toISOString() }));
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Debug текущей задачи' });
  expect(await within(dialog).findByText('job.accepted')).toBeInTheDocument();
  expect(within(dialog).getByText('reconnect')).toBeInTheDocument();
  expect(within(dialog).getByText('текущая вкладка')).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Debug текущей задачи' })).not.toBeInTheDocument());
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
  fireEvent.click(await screen.findByRole('button', { name: 'Debug' }));
  const dialog = await screen.findByRole('dialog', { name: 'Debug текущей задачи' });
  expect(dialog.querySelector('aside')).toHaveClass('w-full', 'lg:max-w-2xl');
  expect(mocks.getJobTraceDetail).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: /LLM output/ }));
  await waitFor(() => expect(mocks.getJobTraceDetail).toHaveBeenCalledWith('debug-detail-job', '00000000-0000-4000-8000-000000000010'));
  expect(await within(dialog).findByText(/"state": "REDACTED"/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Загрузить ещё' }));
  expect(await within(dialog).findByText('job.progress')).toBeInTheDocument();
  expect(mocks.getJobTrace).toHaveBeenLastCalledWith('debug-detail-job', { cursor: 'next-page', limit: 50 });
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
  expect(screen.getByPlaceholderText('Опишите бизнес-задачу...')).toHaveValue('');
  expect(localStorage.getItem('reqai.viewedJob')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Новая задача' })).not.toBeInTheDocument();

  const drawer = await openHistory();
  expect(within(drawer).getByText('Подготовка требований', { exact: true })).toBeInTheDocument();
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
  const researchButton = await screen.findByRole('button', { name: 'Улучшить требования с помощью AI' });
  fireEvent.click(researchButton);

  expect(await screen.findByText('Другая задача уже выполняется. Дождитесь её завершения и попробуйте снова.')).toBeInTheDocument();
  expect(screen.queryByText(/USER_ACTIVE_JOB_LIMIT|Active job limit reached for user/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Улучшить требования с помощью AI' })).toBeEnabled();
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
  expect(screen.queryByRole('heading', { name: 'Сформулируйте бизнес-задачу' })).not.toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Этапы подготовки требований' })).toBeInTheDocument();
  expectBusinessStage(3);
  expect(screen.getByRole('button', { name: 'Все результаты · 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Тренды рынка · 1' })).toBeInTheDocument();
  const insightCards = screen.getByRole('region', { name: 'Карточки результатов AI-исследования' });
  expect(within(insightCards).getAllByRole('article')).toHaveLength(1);
  const applicability = within(insightCards).getByRole('meter', { name: 'Применимость' });
  expect(applicability).toHaveAttribute('aria-valuenow', '90');
  expect(applicability).toHaveAttribute('aria-valuetext', 'Применимость 90%');
  const applicabilitySegments = within(applicability).getAllByTestId('applicability-segment');
  expect(applicabilitySegments).toHaveLength(5);
  expect(applicabilitySegments.filter((segment) => segment.dataset.active === 'true')).toHaveLength(5);
  expect(within(insightCards).getByTestId('insight-category-icon-trends')).toBeInTheDocument();
  const insightCard = within(insightCards).getByRole('article');
  expect(within(insightCard).getByText('Рынок переходит к автоматизации')).not.toHaveClass('line-clamp-2');
  expect(within(insightCard).getByTestId('insight-relations-i1')).not.toBeVisible();
  expect(within(insightCard).getByText('В функциональные')).not.toBeVisible();
  expect(within(insightCard).getByText('Клиенты ожидают быстрый ответ.')).not.toBeVisible();
  expect(within(insightCard).getByText('Исследование рынка')).not.toBeVisible();
  expect(within(insightCard).queryByText('Система должна автоматически обрабатывать заявку')).not.toBeInTheDocument();
  fireEvent.click(within(insightCard).getByText('Подробнее · 1 предложение'));
  expect(within(insightCard).getByTestId('insight-relations-i1')).toBeVisible();
  expect(within(insightCard).getByText('Клиенты ожидают быстрый ответ.')).toBeVisible();
  expect(within(insightCard).getByText('Исследование рынка')).toBeVisible();
  fireEvent.click(within(insightCard).getByRole('button', { name: 'Показать предложение: В функциональные' }));
  expect(within(insightCard).getByText('Система должна автоматически обрабатывать заявку')).toBeVisible();
  const rejectEnhancement = within(insightCard).getByRole('button', { name: 'Отклонить улучшение: Система должна автоматически обрабатывать заявку' });
  fireEvent.click(rejectEnhancement);
  expect(rejectEnhancement).toHaveAttribute('aria-pressed', 'true');
  const acceptEnhancement = screen.getByRole('button', { name: 'Принять улучшение: Система должна автоматически обрабатывать заявку' });
  fireEvent.click(acceptEnhancement);
  expect(acceptEnhancement).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByText('Исходные данные'));
  fireEvent.click(screen.getByRole('button', { name: 'Требования для AI' }));
  const sourceRequirements = screen.getByRole('region', { name: 'Требования, переданные в AI-исследование' });
  expect(within(sourceRequirements).getByRole('region', { name: 'Бизнес-требования' })).toHaveClass('border-t-blue-500');
  expect(within(sourceRequirements).getByRole('region', { name: 'Функциональные требования' })).toHaveClass('border-t-violet-500');
  expect(within(sourceRequirements).getByRole('region', { name: 'Нефункциональные требования' })).toHaveClass('border-t-amber-500');
  expect(within(sourceRequirements).getByText('Что должно измениться для клиента и бизнеса')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Действия для BT-1' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'К результатам AI-исследования' }));
  expect(screen.getByRole('button', { name: 'Принять улучшение: Система должна автоматически обрабатывать заявку' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'ri1', baseVersionId: 'base-v2', decisions: { acceptedEnhancementKeys: ['i1:0'], rejectedEnhancementKeys: [] } })));
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
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenNthCalledWith(2, expect.objectContaining({ baseVersionId: 'final-v2', decisions: { acceptedEnhancementKeys: ['i1:0'], rejectedEnhancementKeys: [] } })));
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
  expect(accept).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByText('Исходные данные'));
  fireEvent.click(screen.getByRole('button', { name: 'Бизнес-задача' }));
  expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent(originalContext);
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  expect(screen.getByText('Результаты AI-исследования')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Принять улучшение: Система должна напоминать руководителю о заявке' })).toHaveAttribute('aria-pressed', 'true');
});

test('builds a compact fallback enhancement for historical insights without structured enhancements', async () => {
  const content = JSON.stringify({ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: { business: [], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'base-old', insights: [{ id: 'old-risk', category: 'risks', title: 'Риск задержки', summary: 'Обработка может занимать больше допустимого времени.', applicability: 70 }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'ri-old', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'ri-old', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'ri-old', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', outcome: 'COMPLETE', resultArtifactId: 'ria-old', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);

  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('AI-исследование требований');
  const insightCards = await screen.findByRole('region', { name: 'Карточки результатов AI-исследования' });
  fireEvent.click(within(insightCards).getByText('Подробнее · 1 предложение'));
  expect(within(insightCards).getByText('В нефункциональные')).toBeVisible();
  fireEvent.click(within(insightCards).getByRole('button', { name: 'Показать предложение: В нефункциональные' }));
  const fallbackText = insightCards.querySelector('.whitespace-pre-line');
  expect(fallbackText).toBeVisible();
  expect(fallbackText).toHaveTextContent('Риск задержки Обработка может занимать больше допустимого времени.');
  expect(within(insightCards).getByRole('button', { name: /Отклонить улучшение: Риск задержки/ })).toBeInTheDocument();
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
  expect(await screen.findByRole('heading', { name: 'Проверка реестра требований' })).toBeInTheDocument();
  expect(screen.getByRole('tablist', { name: 'Типы требований' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /BR · Бизнес-требования/ })).toHaveTextContent('1');
  expect(screen.getByRole('region', { name: 'Функциональные требования' })).toBeInTheDocument();
  const business = screen.getByRole('region', { name: 'Бизнес-требования' });
  fireEvent.click(within(business).getByText('Источник, качество и связи'));
  expect(within(business).getByText('Извлечено из источника')).toBeInTheDocument();
  expect(within(business).getByText('Готово')).toBeInTheDocument();

  fireEvent.click(within(business).getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(within(business).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByLabelText('Текст требования BR-001'), { target: { value: 'Сократить время согласования заявки' } });
  fireEvent.click(screen.getByRole('button', { name: 'Готово' }));

  const functional = screen.getByRole('region', { name: 'Функциональные требования' });
  fireEvent.click(within(functional).getByRole('button', { name: 'Добавить требование' }));
  fireEvent.change(within(functional).getByRole('textbox', { name: 'Новое требование: FR' }), { target: { value: 'Система сохраняет историю статусов' } });
  fireEvent.click(within(functional).getByRole('button', { name: 'Добавить' }));
  expect(within(functional).getByText('FR-002')).toBeInTheDocument();
  expect(within(functional).getByText('Система сохраняет историю статусов')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Сохранить проверенную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'babok-job', baseVersionId: null, registry: expect.objectContaining({ schemaVersion: 'babok-requirements.v1' }), editedRecordIds: expect.arrayContaining(['BR-001', 'FR-002']) })));
  const savedPayload = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(savedPayload.registry.groups.BR[0].text).toBe('Сократить время согласования заявки');
  expect(savedPayload.registry.groups.FR.some((item) => item.id === 'FR-002')).toBe(true);
  expect(await screen.findByRole('button', { name: 'Перейти к финальной версии' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Перейти к финальной версии' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenNthCalledWith(2, expect.objectContaining({ baseVersionId: 'babok-v1', decisions: { skippedResearch: true }, registry: expect.any(Object) })));
  expect(await screen.findByRole('heading', { name: 'Финальная версия требований' })).toBeInTheDocument();
  expect(screen.getByText('Система сохраняет историю статусов')).toBeInTheDocument();
});

test('keeps BABOK target types and decision lineage in linked research', async () => {
  const baseRegistry = makeBabokRegistry();
  const content = JSON.stringify({
    mode: 'REQUIREMENTS_INSIGHTS', baseRegistry, baseRequirements: { business: [], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'babok-base',
    babokIdentifierSet: ['BR-001', 'SR-001', 'FR-001', 'NFR-001', 'TR-001', 'CON-001'],
    insights: [{ id: 'babok-insight', category: 'patterns', title: 'История статусов', summary: 'Прозрачность состояния снижает число повторных обращений.', detail: 'Практика полезна для процесса согласования.', applicability: 85, source_types: ['industry_report'], relatedTo: ['FR-001'], enhancements: [{ targetType: 'FR', targetIds: ['FR-001'], text: 'Система хранит историю статусов заявки' }] }],
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
  fireEvent.click(within(card).getByText('Подробнее · 1 предложение'));
  expect(within(card).getByText('FR-001')).toBeInTheDocument();
  fireEvent.click(within(card).getByRole('button', { name: 'Показать предложение: В FR · функциональные требования' }));
  expect(within(card).getByText('Система хранит историю статусов заявки')).toBeVisible();
  fireEvent.click(within(card).getByRole('button', { name: 'Принять улучшение: Система хранит историю статусов заявки' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'babok-base', decisions: { acceptedEnhancementKeys: ['babok-insight:0'], rejectedEnhancementKeys: [] }, registry: expect.any(Object) })));
  const saved = mocks.saveRequirementsVersion.mock.calls[0][0];
  expect(saved.registry.groups.FR).toEqual(expect.arrayContaining([expect.objectContaining({ researchEnhancementKey: 'babok-insight:0', fromResearch: true, relatedTo: ['FR-001'] })]));
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
