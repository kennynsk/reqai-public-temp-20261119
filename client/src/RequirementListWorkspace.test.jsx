// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BabokRegistryResult } from './AsyncJobWorkspace.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';
import { enterpriseApi } from './api/enterprise-api.js';
import { buildDiscussionContext, validateDiscussionProposal } from '../../server/src/services/requirement-discussion-service.js';
import { normalizeReviewMetadata } from '../../server/src/services/review-metadata.js';
import { assessClarificationQuality } from '../../server/src/services/requirement-quality-assessment.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); globalThis.localStorage?.clear(); globalThis.sessionStorage?.clear(); });
function setup(extra = {}) {
  const registry = roomBookingRegistry();
  registry.groups.NFR = [{ ...registry.groups.FR[0], id: 'NFR-001', text: 'Проверка доступности занимает не более секунды.', quality: 'Требует уточнения', category: 'Производительность' }];
  const save = vi.fn();
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions: {} }} onSave={save} {...extra} />);
  return { registry, save };
}
const select = (id) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Выбрать ${id}:`) }));
const filter = (type) => fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: type } });
const detail = () => document.getElementById('selected-requirement-detail');

test('quality review focuses the assessment and saves it without reopening resolved questions', async () => {
  const registry = roomBookingRegistry();
  registry.groups.BR[0].quality = 'Требует уточнения';
  registry.groups.BR[0].successIndicator = 'Нет конфликтов бронирования';
  const originalReview = normalizeReviewMetadata({ content: registry, allowedGaps: registry.analysis.GAP, actorId: 'alice', now: new Date('2026-10-01T10:00:00Z'), supplied: {
    schemaVersion: 1,
    gaps: Object.fromEntries(registry.analysis.GAP.map((gap) => [gap.id, { state: 'closed', answer: 'Согласовано с владельцем', reason: 'Проверено', closureKind: 'resolved' }])),
    gapRequirements: Object.fromEntries(registry.analysis.GAP.map((gap) => [gap.id, { 'BR-001': { state: 'no-change', reason: 'Бизнес-цель остаётся прежней' } }])),
  } });
  const save = vi.fn();
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions: { review: originalReview } }} onSave={save} />);
  expect(screen.getByText('Связанные вопросы · 0 открытых')).toBeInTheDocument();
  expect(screen.getByText('Оценка формулировки: Требует уточнения')).toBeInTheDocument();
  expect(screen.queryByText('Источник, качество и связи')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Пересмотреть оценку' }));
  const assessment = screen.getByRole('combobox', { name: 'Качество BR-001' });
  expect(assessment).toHaveFocus();
  fireEvent.change(assessment, { target: { value: 'Готово' } });
  expect(screen.getByText('Оценка формулировки: Готово')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  expect(save).toHaveBeenCalledOnce();
  const saved = save.mock.calls[0][0];
  expect(saved.registry.groups.BR[0].quality).toBe('Готово');
  const persisted = normalizeReviewMetadata({ content: saved.registry, baseContent: registry, allowedGaps: registry.analysis.GAP, supplied: saved.decisions.review, inherited: originalReview, actorId: 'bob', now: new Date('2026-10-01T11:00:00Z') });
  for (const gap of registry.analysis.GAP) {
    expect(persisted.gaps[gap.id].state).toBe('closed');
    expect(persisted.gapRequirements[gap.id]['BR-001'].state).toBe('no-change');
    expect(persisted.gapRequirements[gap.id]['BR-001'].actorUserId).toBe('alice');
  }
});
async function compose(type, label) {
  fireEvent.click(screen.getByText('Добавить требование', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
  return screen.findByRole('textbox', { name: `Новое требование: ${type}` });
}

test('registry header reports review progress and keeps empty types in the single selector', () => {
  setup();
  expect(screen.getByText(/^Качество · \d+ из \d+$/)).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Тип требований' })).toHaveValue('all');
  expect(screen.getByRole('option', { name: 'Требования перехода · 0' })).toHaveValue('TR');
  expect(screen.getByRole('option', { name: /^Нефункциональные требования ·/ })).toHaveValue('NFR');
  expect(within(detail()).getByText('BR · Бизнес-требования')).toHaveClass('bg-blue-50');
});

test('question reasons are visible once and open the common workspace', () => {
  setup();
  expect(screen.getAllByText('Канал уведомлений', { exact: true })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Закрыть как решённый' })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Разобрать вопрос' })[0]);
  expect(screen.getByRole('dialog', { name: 'Уточнение GAP-001' })).toHaveTextContent('Канал уведомлений');
  expect(screen.getByLabelText('Ответ на GAP-001')).toBeVisible();
});

test('list reserves room above the first card so its selection ring clears the sticky heading', () => {
  setup();
  const list = document.querySelector('.reqai-requirement-selector ul');
  expect(list).toHaveClass('pt-1');
  expect(screen.getByRole('button', { name: /^Выбрать BR-001:/ })).toHaveClass('ring-2');
});

test('registry heading separates from cards only while the list is scrolled', () => {
  setup();
  const nav = document.querySelector('.reqai-requirement-selector');
  const heading = nav.querySelector('.reqai-requirement-selector-heading');
  expect(heading.dataset.scrolled).toBe('false');
  expect(heading).not.toHaveClass('shadow-[0_1px_0_0_theme(colors.slate.200),0_3px_10px_-4px_rgb(15_23_42/0.15)]');
  nav.scrollTop = 12;
  fireEvent.scroll(nav);
  expect(heading.dataset.scrolled).toBe('true');
  expect(heading).toHaveClass('shadow-[0_1px_0_0_theme(colors.slate.200),0_3px_10px_-4px_rgb(15_23_42/0.15)]');
  nav.scrollTop = 0;
  fireEvent.scroll(nav);
  expect(heading.dataset.scrolled).toBe('false');
});

test('opens one detail, retains visible selection and combines type, search and quality filters', () => {
  setup();
  expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Сократить конфликты');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  select('FR-002');
  filter('FR');
  expect(screen.getByRole('button', { name: /^Выбрать FR-002:/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск требований' }), { target: { value: 'fr-001' } });
  expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Система запрещает');
  expect(screen.queryByRole('button', { name: /^Выбрать FR-002:/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Нужно уточнить' }));
  expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Нет требований');
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
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
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
  fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Категория NFR-001' })).toHaveFocus());
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Категория');
});

test('related requirement opens a preview without changing the search or selection', async () => {
  setup();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'FR-001' } });
  const trigger = within(detail()).getByRole('button', { name: 'BR-001', exact: true });
  fireEvent.click(trigger);
  expect(await screen.findByRole('dialog', { name: /Бизнес-требование · BR-001/ })).toHaveTextContent('Сократить конфликты бронирования.');
  expect(screen.getByRole('searchbox')).toHaveValue('FR-001');
  expect(screen.getByRole('button', { name: /^Выбрать FR-001:/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('empty type stays addable and new record is selected despite a previous search', async () => {
  setup();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  filter('SR');
  expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Нет требований');
  const input = await compose('SR', 'Требования заинтересованных сторон');
  fireEvent.change(input, { target: { value: 'Сотрудник выбирает комнату.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
  expect(screen.getByRole('button', { name: /^Выбрать SR-001:/ })).toHaveAttribute('aria-pressed', 'true');
  expect(within(detail()).getByRole('heading', { level: 2 })).toHaveTextContent('Сотрудник выбирает комнату.');
  expect(screen.getByRole('searchbox')).toHaveValue('');
});

test('new-record drafts survive switching composers and participate in global save', async () => {
  const { save } = setup();
  fireEvent.change(await compose('SR', 'Требования заинтересованных сторон'), { target: { value: 'Роль сотрудника' } });
  fireEvent.change(await compose('TR', 'Требования перехода'), { target: { value: 'Перенести расписание' } });
  expect(await compose('SR', 'Требования заинтересованных сторон')).toHaveValue('Роль сотрудника');
  filter('BR');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
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
  expect(within(detail()).getByRole('button', { name: 'BR-001', exact: true })).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});

test('initial record opens its detail and preserves read-only and final-editor composition', () => {
  setup({ initialRecordId: 'FR-002' });
  expect(screen.getByRole('button', { name: /^Выбрать FR-002:/ })).toHaveAttribute('aria-pressed', 'true');
  cleanup();
  setup({ readOnly: true });
  expect(screen.queryByRole('button', { name: 'Добавить требование' })).not.toBeInTheDocument();
  select('FR-001');
  expect(screen.getByLabelText('Детали требования FR-001')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Действия для FR-001' })).not.toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Список требований' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
  cleanup();
  setup({ finalVersion: true });
  expect(screen.getByRole('navigation', { name: 'Список требований' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Вид требований' })).not.toBeInTheDocument();
});


test('selected record has one discussion action that keeps its anchor and includes other edits', async () => {
  const get = vi.spyOn(enterpriseApi, 'getRequirementDiscussion').mockResolvedValue({ discussionId: 'discussion', messages: [] });
  vi.spyOn(enterpriseApi, 'subscribeRequirementDiscussionEvents').mockResolvedValue(undefined);
  const send = vi.spyOn(enterpriseApi, 'sendRequirementDiscussionMessage').mockResolvedValue({ messages: [] });
  setup({ jobId: 'rooms' });
  fireEvent.click(within(detail()).getByRole('button', { name: 'Редактировать' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BR-001' }), { target: { value: 'Уточнённая цель' } });
  select('FR-001');
  const card = within(detail());
  fireEvent.click(card.getByRole('button', { name: 'Действия для FR-001' }));
  expect(card.getByRole('button', { name: 'Удалить' })).toBeVisible();
  expect(card.getAllByRole('button', { name: /^Обсудить .*AI$/ })).toHaveLength(1);
  fireEvent.click(card.getByRole('button', { name: 'Обсудить с AI' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith('rooms', 'FR-001', expect.any(Object)));
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для FR-001' }), { target: { value: 'Как уточнить?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await waitFor(() => expect(send).toHaveBeenCalledWith('rooms', 'FR-001', expect.objectContaining({ baseVersionId: 'v1', draft: expect.objectContaining({ registry: expect.objectContaining({ groups: expect.objectContaining({ BR: [expect.objectContaining({ text: 'Уточнённая цель' })] }) }) }) }), expect.any(String)));
});

test('a completed gap opens from the requirement and closes in the shared panel', () => {
  const registry = roomBookingRegistry();
  const save = vi.fn();
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer: 'По количеству участников.' } }, gapRequirements: { 'GAP-001': { 'BR-001': { state: 'incorporated', reason: '' } } } } };
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Разобрать вопрос' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть как решённый' }));
  expect(screen.getByText('Закрыт · ответ учтён')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  expect(save.mock.calls[0][0].decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', closureKind: 'resolved', reason: expect.stringContaining('BR-001') });
});

test('no-change needs a reason within the single question dialog', () => {
  const registry = roomBookingRegistry(); const save = vi.fn();
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer: 'По количеству участников.' } } } };
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Разобрать вопрос' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Изменение не требуется' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  const confirm = screen.getByRole('button', { name: 'Подтвердить решение' }); expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Обоснование отсутствия изменения' }), { target: { value: 'Уже покрыто существующим правилом' } });
  fireEvent.click(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  expect(save.mock.calls[0][0].decisions.review.gapRequirements['GAP-001']['BR-001']).toMatchObject({ state: 'no-change', reason: 'Уже покрыто существующим правилом' });
});

test('a fully checked gap still requires an answer before closure', () => {
  const registry = roomBookingRegistry();
  const decisions = { review: { gapRequirements: { 'GAP-001': { 'BR-001': { state: 'incorporated', reason: '' } } } } };
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={vi.fn()} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Разобрать вопрос' })[0]);
  expect(screen.queryByRole('button', { name: 'Закрыть как решённый' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Ответ на GAP-001' })).toBeVisible();
});

test('guided clarification runs from question to proposal, explicit acceptance and a saveable version', async () => {
  const registry = roomBookingRegistry();
  registry.groups.BR[0].quality = 'Требует уточнения';
  vi.spyOn(enterpriseApi, 'getRequirementDiscussion').mockResolvedValue({ discussionId: 'discussion', messages: [] });
  vi.spyOn(enterpriseApi, 'subscribeRequirementDiscussionEvents').mockResolvedValue(undefined);
  let turns = 0;
  vi.spyOn(enterpriseApi, 'sendRequirementDiscussionMessage').mockImplementation(async (job, anchorId, body) => {
    const messages = [{ messageId: 'assistant', role: 'assistant', text: 'Как измерить результат?', status: 'completed' }];
    if (++turns === 1) return { messages, proposal: null };
    const snapshot = buildDiscussionContext({ content: body.draft?.registry || registry, decisions: body.draft?.decisions || {}, anchorId, baseVersionId: 'v1' });
    const validated = { proposalId: 'guided-workspace-001', ...validateDiscussionProposal({ explanation: 'Уточнить показатель', changes: [{ targetId: 'BR-001', before: { successIndicator: '' }, after: { successIndicator: '0 конфликтов бронирования за месяц' }, rationale: 'Целевой показатель пользователя' }], clarification: { gapId: anchorId, answer: '0 конфликтов за месяц', remainingQuestions: [], checks: [{ requirementId: 'BR-001', state: 'incorporated', reason: 'Показатель добавлен к бизнес-цели' }] } }, { content: snapshot }) };
    validated.qualityAssessment = await assessClarificationQuality({ content: body.draft?.registry || registry, decisions: body.draft?.decisions || {}, proposal: validated, methodology: 'Test methodology', execute: async (messages) => {
      const revision = messages[1].content.match(/"revision":"([^"]+)"/)[1];
      if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision, checks: Object.values(registry.groups).flat().map((record) => ({ id: record.id, pass: true, issues: [] })) }) };
      return { text: JSON.stringify({ schemaVersion: 'babok-quality-assessment.v2', revision, assessments: Object.values(registry.groups).flat().map((record) => ({ id: record.id, quality: record.id === 'BR-001' ? 'Готово' : record.quality, reason: 'Цель и проверяемый показатель определены.', blockingGapIds: [], evidence: [{ recordId: record.id, field: 'text', quote: record.text }] })) }) };
    } });
    // jsonb storage reorders object keys (answer before question); acceptance
    // must compare bases semantically, not by serialized key order.
    return { messages, proposal: { ...validated, gapBases: Object.fromEntries(Object.entries(validated.gapBases || {}).map(([gapId, basis]) => [gapId, { answer: basis.answer, question: basis.question }])) } };
  });
  const save = vi.fn();
  render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions: {} }} jobId="rooms" initialRecordId="GAP-007" onSave={save} />);
  expect(screen.getByLabelText('Ответ на GAP-007')).toBeVisible();
  expect(turns).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Разобрать с AI' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Начать уточнение' }));
  await screen.findByText('Как измерить результат?');
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для GAP-007' }), { target: { value: '0 конфликтов за месяц' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  const accept = await screen.findByRole('button', { name: 'Применить уточнение и закрыть вопрос' });
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(accept);
  expect(screen.getByRole('button', { name: 'Принято в черновик' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Сохранить версию' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '← К вопросу GAP-007' }));
  expect(screen.getByText('Закрыт · ответ учтён')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Ответ на GAP-007' })).toHaveValue('0 конфликтов за месяц');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups.BR[0]).toMatchObject({ successIndicator: '0 конфликтов бронирования за месяц', source: registry.groups.BR[0].source });
  expect(payload.registry.groups.BR[0].quality).toBe('Готово');
  const saved = normalizeReviewMetadata({ supplied: payload.decisions.review, content: payload.registry, allowedGaps: payload.registry.analysis.GAP, contextId: 'source', actorId: 'alice', now: new Date(), baseVersionId: 'v1' });
  expect(saved.gaps['GAP-007'].state).toBe('closed');
  expect(saved.discussionProposals['guided-workspace-001'].qualityAssessment.assessments).toHaveLength(3);
});

test('focused card exposes edit and keeps ordinary AI separate from questions', () => {
  setup({ jobId: 'rooms' });
  const card = within(detail());
  expect(card.getByRole('button', { name: 'Редактировать', exact: true }).closest('details')).toBeNull();
  expect(card.getAllByRole('button', { name: 'Разобрать вопрос' })).toHaveLength(7);
  fireEvent.click(card.getByRole('button', { name: 'Редактировать', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Текст требования BR-001' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Качество BR-001' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Критерий успеха BR-001' }).tagName).toBe('TEXTAREA');
});
