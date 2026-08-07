// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(), getJob: vi.fn(), getResult: vi.fn(), getResultContent: vi.fn(), getCapabilities: vi.fn(),
  uploadArtifact: vi.fn(), createJob: vi.fn(), cancelJob: vi.fn(), downloadArtifact: vi.fn(),
  listRequirementsVersions: vi.fn(), getRequirementsVersion: vi.fn(), saveRequirementsVersion: vi.fn(), subscribe: vi.fn(),
}));

vi.mock('./api/enterprise-api.js', () => ({
  enterpriseApi: {
    listJobs: mocks.listJobs, getJob: mocks.getJob, getResult: mocks.getResult, getResultContent: mocks.getResultContent,
    getCapabilities: mocks.getCapabilities, uploadArtifact: mocks.uploadArtifact, createJob: mocks.createJob,
    cancelJob: mocks.cancelJob, downloadArtifact: mocks.downloadArtifact, listRequirementsVersions: mocks.listRequirementsVersions,
    getRequirementsVersion: mocks.getRequirementsVersion, saveRequirementsVersion: mocks.saveRequirementsVersion,
  },
  subscribeJobEvents: mocks.subscribe,
}));

import AsyncJobWorkspace from './AsyncJobWorkspace.jsx';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
} });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  mocks.listRequirementsVersions.mockResolvedValue({ items: [] });
  mocks.getCapabilities.mockResolvedValue({ capabilities: { models: ['GC-Max', 'GC-M', 'GC-Lite'] } });
  mocks.subscribe.mockResolvedValue();
});
afterEach(cleanup);

async function openHistory() {
  fireEvent.click(await screen.findByRole('button', { name: 'История' }));
  return screen.findByRole('dialog', { name: 'История задач' });
}

async function selectHistoryEntry(name) {
  const drawer = await openHistory();
  const label = await within(drawer).findByText(name, { exact: true });
  fireEvent.click(label.closest('button'));
}

async function openToolsAndSelect(name) {
  fireEvent.click(screen.getByText('Дополнительные инструменты', { exact: true }));
  fireEvent.click(await screen.findByRole('button', { name }));
}

test('shows the guided workflow and hides expert settings by default', async () => {
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: 'Подготовка требований' })).toBeInTheDocument();
  const steps = screen.getByRole('list', { name: 'Этапы подготовки требований' });
  expect(within(steps).getByText('Контекст')).toBeInTheDocument();
  expect(within(steps).getByText('AI-ресерч')).toBeInTheDocument();
  expect(screen.getByText('Необязательный шаг')).toBeInTheDocument();
  expect(screen.getByText('Настройки AI')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Модель', hidden: true })).not.toBeVisible();
});

test('restores abandoned active session with clear activity feedback', async () => {
  localStorage.setItem('reqai.activeJob', 'j1');
  mocks.getJob.mockResolvedValue({ jobId: 'j1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', progress: 40 });
  render(<AsyncJobWorkspace />);
  expect(await screen.findByRole('button', { name: 'Исследование выполняется…' })).toBeDisabled();
  expect(screen.queryByText('Проводим исследование…')).not.toBeInTheDocument();
  expect(screen.getAllByText('Исследование выполняется…')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  expect(screen.queryByText('Результат появится на странице автоматически.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
  expect(document.body).not.toHaveTextContent('40%');
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

test('opens prompt testing from secondary tools and submits recommended defaults', async () => {
  mocks.uploadArtifact.mockResolvedValue({ artifactId: 'artifact-1' });
  mocks.createJob.mockResolvedValue({ jobId: 'job-1' });
  mocks.getJob.mockResolvedValue({ jobId: 'job-1', type: 'RESEARCH', mode: 'PROMPT_TEST', status: 'ACCEPTED', progress: 0 });
  render(<AsyncJobWorkspace />);
  await screen.findByText('Дополнительные инструменты', { exact: true });
  await openToolsAndSelect('Тестирование промптов');
  expect(screen.getByRole('heading', { name: 'Тестирование промптов' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Пользовательский промпт'), { target: { value: 'Проверь требования' } });
  fireEvent.click(screen.getByRole('button', { name: 'Запустить задачу' }));
  expect(await screen.findByRole('button', { name: 'Исследование выполняется…' })).toBeDisabled();
  expect(mocks.createJob.mock.calls[0][0]).toMatchObject({ type: 'RESEARCH', options: { mode: 'PROMPT_TEST', inputFormat: 'PROMPT_JSON', model: 'GC-Max' } });
});

test.each([
  ['Исследование'],
  ['Сравнение (модели, температура)'],
  ['Агентное сравнение'],
  ['Агентное исследование'],
  ['Тестирование промптов'],
])('uses the shared primary visual shell for «%s»', async (toolName) => {
  render(<AsyncJobWorkspace />);
  await screen.findByText('Дополнительные инструменты', { exact: true });
  await openToolsAndSelect(toolName);
  const heading = screen.getByRole('heading', { name: toolName });
  expect(heading.closest('main')).toHaveClass('max-w-7xl', 'px-4', 'py-6');
  const card = screen.getByText(toolName === 'Тестирование промптов' ? 'Запрос для проверки' : 'Исходные данные').closest('section');
  expect(card).toHaveClass('bg-white', 'rounded-2xl', 'border-gray-200', 'shadow-sm');
  expect(screen.getByText('Настройки AI')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Анализировать требования|Запустить задачу/ })).toHaveClass('bg-indigo-600');
});

test('saves reviewed decomposition and starts linked research inside requirements workspace', async () => {
  const content = JSON.stringify({ mode: 'DECOMPOSITION', decomposition: [{ content: {
    business: [{ id: 'BT-1', text: 'Снизить срок обработки' }], functional: [{ id: 'FT-1', text: 'Автоматизировать проверку' }], nonfunctional: [],
  } }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'j4', type: 'DECOMPOSITION', mode: 'DECOMPOSITION_WITH_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValueOnce({ jobId: 'j4', type: 'DECOMPOSITION', mode: 'DECOMPOSITION_WITH_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 })
    .mockResolvedValue({ jobId: 'research-1', parentJobId: 'j4', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'ACCEPTED', progress: 0 });
  mocks.getResult.mockResolvedValue({ jobId: 'j4', type: 'DECOMPOSITION', outcome: 'COMPLETE', resultArtifactId: 'a4', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.saveRequirementsVersion.mockImplementation(async ({ requirements }) => ({ versionId: 'version-1', sourceJobId: 'j4', requirements, createdAt: new Date().toISOString() }));
  mocks.createJob.mockResolvedValue({ jobId: 'research-1' });
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Подготовка требований');
  expect(await screen.findByText('Проверьте и отредактируйте требования')).toBeInTheDocument();
  const contextSummary = screen.getByLabelText('Завершённый бизнес-контекст');
  expect(contextSummary.closest('details')).not.toHaveAttribute('open');
  expect(screen.getByPlaceholderText('Опишите бизнес-задачу...')).not.toBeVisible();
  expect(screen.queryByText('Результат задачи')).not.toBeInTheDocument();
  fireEvent.click(contextSummary);
  expect(screen.getByPlaceholderText('Опишите бизнес-задачу...')).toBeVisible();
  const researchButton = screen.getByRole('button', { name: 'Провести AI-Ресерч' });
  expect(researchButton).toBeDisabled();
  expect(researchButton.closest('.sticky')).toHaveClass('top-20');
  fireEvent.click(screen.getAllByRole('button', { name: /Редактировать/ })[0]);
  fireEvent.change(screen.getByLabelText('Текст требования BT-1'), { target: { value: 'Снизить срок обработки до одного дня' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Провести AI-Ресерч' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Провести AI-Ресерч' }));
  await waitFor(() => expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESEARCH', inputArtifactId: 'version-1', parentJobId: 'j4', options: expect.objectContaining({ mode: 'REQUIREMENTS_INSIGHTS' }) })));
  expect(mocks.saveRequirementsVersion).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Подготовка требований' })).toHaveAttribute('aria-current', 'page');
});

test('restores requirements insights and applies explicit accepted enhancements', async () => {
  const content = JSON.stringify({ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: { business: [{ id: 'BT-1', text: 'Сократить срок' }], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'base-v2', insights: [{ id: 'i1', category: 'trends', title: 'Мгновенная обработка', summary: 'Рынок переходит к автоматизации', detail: 'Клиенты ожидают быстрый ответ.', applicability: 90, source_types: ['market_research'], relatedTo: ['BT-1'], enhancements: [{ targetType: 'functional', text: 'Система должна автоматически обрабатывать заявку' }] }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'ri1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'ri1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'ri1', type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', outcome: 'COMPLETE', resultArtifactId: 'ria1', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.saveRequirementsVersion.mockResolvedValue({ versionId: 'final-v2', sourceJobId: 'ri1', createdAt: new Date().toISOString(), requirements: {} });
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('AI-Ресерч требований');
  expect(await screen.findByText('AI-Ресерчер')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Принять улучшение: Система должна автоматически обрабатывать заявку' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'ri1', baseVersionId: 'base-v2', decisions: { acceptedEnhancementKeys: ['i1:0'], rejectedEnhancementKeys: [] } })));
  expect(mocks.saveRequirementsVersion.mock.calls[0][0].requirements.functional[0].text).toBe('Система должна автоматически обрабатывать заявку');
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

test('shows summary-first research tabs and saves explicit improvement decisions', async () => {
  const content = JSON.stringify({ mode: 'AGENT_RESEARCH', synthesis: 'Краткий итог исследования', baseRequirements: { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] }, inputRequirementsVersionId: 'base-v1', improvementSuggestions: [{ id: 's1', targetType: 'functional', title: 'Добавить контроль', rationale: 'Снижает ошибки', proposedRequirement: 'Система должна проверять данные' }] });
  mocks.listJobs.mockResolvedValue({ items: [{ jobId: 'r1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'SUCCEEDED', outcome: 'COMPLETE', createdAt: new Date().toISOString() }], nextCursor: null });
  mocks.getJob.mockResolvedValue({ jobId: 'r1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100 });
  mocks.getResult.mockResolvedValue({ jobId: 'r1', type: 'RESEARCH', mode: 'AGENT_RESEARCH', outcome: 'COMPLETE', resultArtifactId: 'ra1', modelAttempts: [] });
  mocks.getResultContent.mockResolvedValue(content);
  mocks.saveRequirementsVersion.mockResolvedValue({ versionId: 'final-v1', sourceJobId: 'r1', createdAt: new Date().toISOString(), requirements: {} });
  render(<AsyncJobWorkspace />);
  await selectHistoryEntry('Агентное исследование');
  expect(await screen.findByText('Краткий итог исследования')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Улучшения · 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Принять: Добавить контроль' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
  await waitFor(() => expect(mocks.saveRequirementsVersion).toHaveBeenCalledWith(expect.objectContaining({ sourceJobId: 'r1', baseVersionId: 'base-v1', decisions: { acceptedSuggestionIds: ['s1'], rejectedSuggestionIds: [] } })));
  expect(mocks.saveRequirementsVersion.mock.calls[0][0].requirements.functional[0].text).toBe('Система должна проверять данные');
});
