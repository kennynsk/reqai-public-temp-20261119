// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BabokRegistryResult } from './AsyncJobWorkspace.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';
import { enterpriseApi } from './api/enterprise-api.js';
import { buildDiscussionContext, validateDiscussionProposal } from '../../server/src/services/requirement-discussion-service.js';
import { normalizeReviewMetadata } from '../../server/src/services/review-metadata.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); globalThis.localStorage?.clear(); globalThis.sessionStorage?.clear(); });
function setup(extra = {}) {
  const registry = roomBookingRegistry();
  registry.groups.NFR = [{ ...registry.groups.FR[0], id: 'NFR-001', text: 'Проверка доступности занимает не более секунды.', quality: 'Требует уточнения', category: 'Производительность' }];
  const save = vi.fn();
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions: {} }} onSave={save} {...extra} />);
  return { registry, save };
}
const select = (id) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Выбрать ${id}:`) }));
const filter = (type) => fireEvent.click(screen.getByRole('button', { name: type === 'all' ? 'Все типы' : new RegExp(`^${type} ·`) }));
const detail = () => document.getElementById('selected-requirement-detail');
async function compose(type, label) {
  fireEvent.click(screen.getByText('Добавить требование', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
  return screen.findByRole('textbox', { name: `Новое требование: ${type}` });
}

test('registry header reports review progress and demotes empty type chips', () => {
  setup();
  expect(screen.getByText(/^Проверено \d+ из \d+$/)).toBeInTheDocument();
  const empty = screen.getByRole('button', { name: /^TR ·/ });
  expect(empty).toHaveClass('text-slate-400');
  expect(empty).not.toHaveClass('border-slate-200');
  expect(screen.getByRole('button', { name: /^NFR ·/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Все типы' })).toBeInTheDocument();
  expect(within(detail()).getByText('BR · Бизнес-требования')).toHaveClass('bg-blue-50');
});

test('opens one detail, retains visible selection and combines type, search and quality filters', () => {
  setup();
  expect(within(detail()).getByRole('heading')).toHaveTextContent('Сократить конфликты');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  select('FR-002');
  filter('FR');
  expect(screen.getByRole('button', { name: /^Выбрать FR-002:/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск требований' }), { target: { value: 'fr-001' } });
  expect(within(detail()).getByRole('heading')).toHaveTextContent('Система запрещает');
  expect(screen.queryByRole('button', { name: /^Выбрать FR-002:/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Нужно уточнить' }));
  expect(within(detail()).getByRole('heading')).toHaveTextContent('Нет требований');
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'доступности' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Нужно уточнить' }));
  expect(screen.getByRole('button', { name: /^Выбрать NFR-001:/ })).toHaveAttribute('aria-pressed', 'true');
});

test('keeps text, structured fields and relations across selection and saves hidden drafts', () => {
  const { save, registry } = setup();
  fireEvent.click(within(detail()).getByRole('button', { name: 'Редактировать', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: 'Новая бизнес-цель' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Критерий успеха BR-001' }), { target: { value: 'Нет конфликтов' } });
  fireEvent.click(screen.getByText('Редактировать связи'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'FR-002' }));
  select('FR-001'); select('BR-001');
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toHaveValue('Новая бизнес-цель');
  expect(screen.getByRole('textbox', { name: 'Критерий успеха BR-001' })).toHaveValue('Нет конфликтов');
  fireEvent.click(screen.getByText('Редактировать связи'));
  expect(screen.getByRole('checkbox', { name: 'FR-002' })).toBeChecked();
  filter('NFR');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0].registry.groups.BR[0]).toMatchObject({ text: 'Новая бизнес-цель', successIndicator: 'Нет конфликтов', relatedIds: ['FR-002'], source: registry.groups.BR[0].source });
  expect(save.mock.calls[0][0].registry.groups.FR).toEqual(registry.groups.FR);
});

test('reveals and focuses invalid structured fields after switching section and selection', async () => {
  const { save } = setup();
  select('NFR-001');
  fireEvent.click(within(detail()).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Категория NFR-001' }), { target: { value: '' } });
  filter('BR');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'BR-' } });
  fireEvent.click(screen.getByRole('button', { name: 'Вопросы · 7' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Категория NFR-001' })).toHaveFocus());
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Категория');
});

test('a link reveals a requirement outside the current search', async () => {
  setup();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'FR-001' } });
  fireEvent.click(within(detail()).getByRole('link', { name: 'BR-001' }));
  await waitFor(() => expect(document.getElementById('record-BR-001')).toHaveFocus());
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.getByRole('button', { name: /^Выбрать BR-001:/ })).toHaveAttribute('aria-pressed', 'true');
});

test('empty type stays addable and new record is selected despite a previous search', async () => {
  setup();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  filter('SR');
  expect(within(detail()).getByRole('heading')).toHaveTextContent('Нет требований');
  const input = await compose('SR', 'Требования заинтересованных сторон');
  fireEvent.change(input, { target: { value: 'Сотрудник выбирает комнату.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
  expect(screen.getByRole('button', { name: /^Выбрать SR-001:/ })).toHaveAttribute('aria-pressed', 'true');
  expect(within(detail()).getByRole('heading')).toHaveTextContent('Сотрудник выбирает комнату.');
  expect(screen.getByRole('searchbox')).toHaveValue('');
});

test('new-record drafts survive switching composers and participate in global save', async () => {
  const { save } = setup();
  fireEvent.change(await compose('SR', 'Требования заинтересованных сторон'), { target: { value: 'Роль сотрудника' } });
  fireEvent.change(await compose('TR', 'Требования перехода'), { target: { value: 'Перенести расписание' } });
  expect(await compose('SR', 'Требования заинтересованных сторон')).toHaveValue('Роль сотрудника');
  filter('BR');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(save.mock.calls[0][0].registry.groups.SR[0].text).toBe('Роль сотрудника');
  expect(save.mock.calls[0][0].registry.groups.TR[0].text).toBe('Перенести расписание');
});

test('selected deletion falls back safely and undo restores ID and relationships', () => {
  const { save } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
  expect(screen.getByRole('button', { name: /^Выбрать FR-001:/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }));
  select('FR-001');
  expect(within(detail()).getByRole('link', { name: 'BR-001' })).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

test('initial record opens its detail and preserves read-only and final-editor composition', () => {
  setup({ initialRecordId: 'FR-002' });
  expect(screen.getByRole('button', { name: /^Выбрать FR-002:/ })).toHaveAttribute('aria-pressed', 'true');
  cleanup();
  setup({ readOnly: true });
  expect(screen.queryByRole('navigation', { name: 'Список требований' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
  cleanup();
  setup({ finalVersion: true });
  expect(screen.queryByRole('navigation', { name: 'Список требований' })).not.toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Вид требований' })).toBeInTheDocument();
});


test('selected record discussion keeps the original anchor and includes edits from another record', async () => {
  const get = vi.spyOn(enterpriseApi, 'getRequirementDiscussion').mockResolvedValue({ discussionId: 'discussion', messages: [] });
  vi.spyOn(enterpriseApi, 'subscribeRequirementDiscussionEvents').mockResolvedValue(undefined);
  const send = vi.spyOn(enterpriseApi, 'sendRequirementDiscussionMessage').mockResolvedValue({ messages: [] });
  setup({ jobId: 'rooms' });
  fireEvent.click(within(detail()).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: 'Уточнённая цель' } });
  select('FR-001');
  fireEvent.click(within(detail()).getByRole('button', { name: 'Обсудить с AI' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith('rooms', 'FR-001', expect.any(Object)));
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для FR-001' }), { target: { value: 'Как уточнить?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('rooms', 'FR-001', expect.objectContaining({ baseVersionId: 'v1', draft: expect.objectContaining({ registry: expect.objectContaining({ groups: expect.objectContaining({ BR: [expect.objectContaining({ text: 'Уточнённая цель' })] }) }) }) }), expect.any(String)));
});

test('a completed gap closes right from the requirement card', () => {
  const registry = roomBookingRegistry();
  const save = vi.fn();
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer: 'По количеству участников.' } }, gapRequirements: { 'GAP-001': { 'BR-001': { state: 'incorporated', reason: '' } } } } };
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} />);
  select('BR-001');
  fireEvent.click(screen.getByText('Уточнения · 7'));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть как решённый' }));
  expect(screen.getAllByText('Закрыт', { exact: true }).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  const payload = save.mock.calls[0][0];
  expect(payload.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', closureKind: 'resolved', reason: expect.stringContaining('BR-001') });
});

test('marking a checklist item as no-change records a reasoned decision in a dialog', () => {
  const registry = roomBookingRegistry();
  const save = vi.fn();
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer: 'По количеству участников.' } } } };
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} />);
  select('BR-001');
  fireEvent.click(screen.getByText('Уточнения · 7'));
  fireEvent.click(screen.getByRole('button', { name: 'Изменение не требуется для GAP-001 в BR-001' }));
  const confirm = screen.getByRole('button', { name: 'Подтвердить' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Обоснование отсутствия изменения' }), { target: { value: 'Уже покрыто существующим правилом' } });
  fireEvent.click(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(save.mock.calls[0][0].decisions.review.gapRequirements['GAP-001']['BR-001']).toMatchObject({ state: 'no-change', reason: 'Уже покрыто существующим правилом' });
});

test('guided clarification runs from question to proposal, explicit acceptance and a saveable version', async () => {
  const registry = roomBookingRegistry();
  vi.spyOn(enterpriseApi, 'getRequirementDiscussion').mockResolvedValue({ discussionId: 'discussion', messages: [] });
  vi.spyOn(enterpriseApi, 'subscribeRequirementDiscussionEvents').mockResolvedValue(undefined);
  let turns = 0;
  vi.spyOn(enterpriseApi, 'sendRequirementDiscussionMessage').mockImplementation(async (job, anchorId, body) => {
    const messages = [{ messageId: 'assistant', role: 'assistant', text: 'Как измерить результат?', status: 'completed' }];
    if (++turns === 1) return { messages, proposal: null };
    const snapshot = buildDiscussionContext({ content: body.draft?.registry || registry, decisions: body.draft?.decisions || {}, anchorId, baseVersionId: 'v1' });
    return { messages, proposal: { proposalId: 'guided-workspace-001', ...validateDiscussionProposal({ explanation: 'Уточнить показатель', changes: [{ targetId: 'BR-001', before: { successIndicator: '' }, after: { successIndicator: '0 конфликтов бронирования за месяц' }, rationale: 'Целевой показатель пользователя' }], clarification: { gapId: anchorId, answer: '0 конфликтов за месяц', remainingQuestions: [], checks: [{ requirementId: 'BR-001', state: 'incorporated', reason: 'Показатель добавлен к бизнес-цели' }] } }, { content: snapshot }) } };
  });
  const save = vi.fn();
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions: {} }} jobId="rooms" initialRecordId="GAP-007" onSave={save} />);
  const gap = () => document.getElementById('record-GAP-007');
  expect(within(gap()).getByLabelText('Ответ на GAP-007')).not.toBeVisible();
  fireEvent.click(within(gap()).getByRole('button', { name: 'Помочь уточнить' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Начать уточнение' }));
  await screen.findByText('Как измерить результат?');
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для GAP-007' }), { target: { value: '0 конфликтов за месяц' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  const accept = await screen.findByRole('button', { name: 'Применить уточнение и закрыть вопрос' });
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(accept);
  expect(screen.getByRole('button', { name: 'Принято в черновик' })).toBeDisabled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть обсуждение' }).at(-1));
  expect(within(gap()).getByText('Закрыт', { exact: true })).toBeInTheDocument();
  expect(within(gap()).getByRole('textbox', { name: 'Ответ на GAP-007' })).toHaveValue('0 конфликтов за месяц');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups.BR[0]).toMatchObject({ successIndicator: '0 конфликтов бронирования за месяц', source: registry.groups.BR[0].source });
  const saved = normalizeReviewMetadata({ supplied: payload.decisions.review, content: payload.registry, allowedGaps: payload.registry.analysis.GAP, contextId: 'source', actorId: 'alice', now: new Date(), baseVersionId: 'v1' });
  expect(saved.gaps['GAP-007'].state).toBe('closed');
});
