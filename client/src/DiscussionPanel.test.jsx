// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), open: vi.fn(), send: vi.fn(), retry: vi.fn(), cancel: vi.fn(), subscribe: vi.fn(),
}));

vi.mock('./api/enterprise-api.js', () => ({ enterpriseApi: {
  getRequirementDiscussion: mocks.get,
  openRequirementDiscussion: mocks.open,
  sendRequirementDiscussionMessage: mocks.send,
  retryRequirementDiscussion: mocks.retry,
  cancelRequirementDiscussion: mocks.cancel,
  subscribeRequirementDiscussionEvents: mocks.subscribe,
} }));

import DiscussionPanel from './DiscussionPanel.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockRejectedValue({ status: 404 });
  mocks.open.mockResolvedValue({ discussionId: 'd1', messages: [], nextCursor: null });
  mocks.subscribe.mockReturnValue(new Promise(() => {}));
  mocks.send.mockResolvedValue({
    discussionId: 'd1',
    messages: [
      { messageId: 'm1', role: 'user', status: 'completed', text: 'Уточнить', createdAt: '2026-09-10T10:00:00Z' },
      { messageId: 'm2', role: 'assistant', status: 'completed', text: 'Готово', createdAt: '2026-09-10T10:00:01Z' },
    ],
    proposal: { proposalId: 'proposal-1', explanation: 'Уточнение', changes: [{ targetId: 'FR-005', before: { text: 'Старое' }, after: { text: 'Новое' } }] },
    contextSummary: { baseVersionId: 'v1', manifest: { includedIds: ['GAP-002', 'FR-005'] }, includedBytes: 42, omitted: [], unsavedDraft: true },
  });
});

afterEach(cleanup);

test('opens without generation, sends a turn, and exposes proposal actions', async () => {
  const onClose = vi.fn(); const onApplyProposal = vi.fn(() => true); const onRejectProposal = vi.fn(() => true);
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" contextReady onClose={onClose} onApplyProposal={onApplyProposal} onRejectProposal={onRejectProposal} />);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledWith('job-1', 'GAP-002', { baseVersionId: 'v1' }, expect.objectContaining({ signal: expect.any(AbortSignal) })));
  expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Сообщение для GAP-002' }), { target: { value: 'Уточнить' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByText('Предложение изменений · 1');
  expect(mocks.send).toHaveBeenCalledWith('job-1', 'GAP-002', expect.objectContaining({ message: 'Уточнить', baseVersionId: 'v1' }), expect.any(String));
  expect(screen.getByText(/Включены записи: GAP-002, FR-005/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));
  expect(onApplyProposal).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Отклонить предложение' }));
  expect(onRejectProposal).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть обсуждение' }).at(-1));
  expect(onClose).toHaveBeenCalled();
});

test('read-only discussion does not create a missing history record', async () => {
  render(<DiscussionPanel jobId="job-1" anchorId="BR-001" baseVersionId="v1" readOnly onClose={vi.fn()} />);
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  expect(mocks.open).not.toHaveBeenCalled();
  expect(screen.getByText(/История пуста/)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Сообщение для BR-001' })).toBeDisabled();
});

test('guided starter sends one explicit request and retains its idempotency key after an uncertain failure', async () => {
  let fail;
  mocks.send.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject; }));
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  const start = await screen.findByRole('button', { name: 'Начать уточнение' });
  expect(mocks.send).not.toHaveBeenCalled();
  fireEvent.click(start); fireEvent.click(start);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  const first = mocks.send.mock.calls[0];
  expect(first[2].message).toMatch(/задай один конкретный следующий вопрос/);
  fail(new Error('Соединение прервано'));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Начать уточнение' }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
  expect(mocks.send.mock.calls[1][2].clientMessageId).toBe(first[2].clientMessageId);
  expect(mocks.send.mock.calls[1][3]).toBe(first[3]);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Сообщение для GAP-002' })).toHaveFocus());
});

test('assistant messages render markdown formatting instead of raw asterisks', async () => {
  mocks.get.mockResolvedValue({ discussionId: 'd1', messages: [{ messageId: 'm2', role: 'assistant', status: 'completed', text: 'План:\n\n1. **Канал** — приложение\n2. *Срок* — три дня' }] });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  const bold = await screen.findByText('Канал');
  expect(bold.tagName).toBe('STRONG');
  expect(bold.closest('ol')).not.toBeNull();
  expect(screen.getByText('Срок').tagName).toBe('EM');
  expect(screen.queryByText(/\*\*Канал\*\*/)).not.toBeInTheDocument();
});

test('user messages keep plain text rendering', async () => {
  mocks.get.mockResolvedValue({ discussionId: 'd1', messages: [{ messageId: 'm1', role: 'user', status: 'completed', text: 'вариант **без форматирования**' }] });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  await screen.findByText('вариант **без форматирования**');
});

test('distinguishes a discussion answer from a rejected proposal and exposes neither as applicable wording', async () => {
  const data = { discussionId: 'd1', messages: [{ messageId: 'm1', role: 'assistant', status: 'completed', text: 'Нужно уточнить срок' }], attempt: { attemptId: 'a1', status: 'completed' }, proposal: null };
  mocks.get.mockResolvedValue(data);
  const result = render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  expect(await screen.findByRole('status', { name: 'Результат ответа AI' })).toHaveTextContent('Обсуждение продолжается');
  expect(screen.queryByRole('region', { name: 'Предложение изменений' })).not.toBeInTheDocument();
  result.unmount();
  mocks.get.mockResolvedValue({ ...data, attempt: { ...data.attempt, errorCode: 'DISCUSSION_PROPOSAL_INVALID' } });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  expect(await screen.findByRole('status', { name: 'Результат ответа AI' })).toHaveTextContent('Предложение отклонено при проверке');
  expect(screen.getByRole('button', { name: 'Подготовить уточнение' })).toBeEnabled();
});

test('proposal explanation renders markdown formatting', async () => {
  mocks.get.mockResolvedValue({ messages: [], proposal: { proposalId: 'p1', explanation: 'Суть: **канал — приложение**', changes: [] } });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  const bold = await screen.findByText('канал — приложение');
  expect(bold.tagName).toBe('STRONG');
});

test('a replayed attempt.started for an already completed attempt does not show a phantom generation', async () => {
  mocks.get.mockResolvedValue({
    discussionId: 'd1', messages: [{ messageId: 'm2', role: 'assistant', status: 'completed', text: 'Ответ' }], nextCursor: null,
    attempt: { attemptId: 'a1', status: 'completed' },
  });
  let emit;
  mocks.subscribe.mockImplementation((_jobId, _anchorId, { onEvent }) => { emit = onEvent; return new Promise(() => {}); });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  await screen.findByText('Ответ');
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());
  await act(async () => {
    // История событий реплеится целиком; завершающее событие может потеряться
    // при обрыве соединения, поэтому старт завершённой попытки игнорируется сам по себе.
    await emit({ id: 1, type: 'attempt.started', data: { attemptId: 'a1', generationId: 'g1' } });
  });
  expect(screen.queryByRole('button', { name: 'Отменить генерацию' })).not.toBeInTheDocument();
  await act(async () => {
    // Новая попытка (другой id) при живом ходе всё ещё переводит панель в «генерация».
    mocks.get.mockResolvedValue({ discussionId: 'd1', messages: [], attempt: { attemptId: 'a2', status: 'running' } });
    await emit({ id: 2, type: 'attempt.started', data: { attemptId: 'a2', generationId: 'g2' } });
  });
  expect(screen.getByRole('button', { name: 'Отменить генерацию' })).toBeInTheDocument();
});

test('old starts cannot replace the latest attempt and cancel targets the server current attempt', async () => {
  const latest = { discussionId: 'd1', messages: [], attempt: { attemptId: 'current-002', assistantMessageId: 'm2', status: 'running' } };
  mocks.get.mockResolvedValue(latest);
  mocks.cancel.mockResolvedValue({ attemptId: 'current-002', status: 'cancelled' });
  let emit;
  mocks.subscribe.mockImplementation((_jobId, _anchorId, { onEvent }) => { emit = onEvent; return new Promise(() => {}); });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" />);
  await screen.findByRole('button', { name: 'Отменить генерацию' });
  await act(async () => { await emit({ type: 'attempt.started', data: { attemptId: 'old-001' } }); });
  fireEvent.click(screen.getByRole('button', { name: 'Отменить генерацию' }));
  await screen.findByRole('button', { name: 'Повторить ответ' });
  expect(mocks.cancel).toHaveBeenCalledWith('job-1', 'current-002');
});

test('reconnect reconciliation recovers a missed cancellation and a completed response is not falsely cancelled', async () => {
  mocks.get.mockResolvedValue({ discussionId: 'd1', messages: [], attempt: { attemptId: 'a1', status: 'running' } });
  mocks.cancel.mockResolvedValue({ attemptId: 'a1', status: 'completed' });
  let emit;
  mocks.subscribe.mockImplementation((_j, _a, { onEvent }) => { emit = onEvent; return new Promise(() => {}); });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Отменить генерацию' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Повторить ответ' })).not.toBeInTheDocument();
  await act(async () => { await emit({ type: 'reconcile', data: { discussionId: 'd1', messages: [], attempt: { attemptId: 'a2', status: 'cancelled' } } }); });
  expect(screen.getByRole('button', { name: 'Повторить ответ' })).toBeInTheDocument();
});

test('a loaded completed attempt never renders as an active generation', async () => {
  mocks.get.mockResolvedValue({
    discussionId: 'd1', messages: [{ messageId: 'm2', role: 'assistant', status: 'completed', text: 'Ответ' }], nextCursor: null,
    attempt: { attemptId: 'a1', status: 'completed' },
  });
  mocks.subscribe.mockReturnValue(new Promise(() => {}));
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  await screen.findByText('Ответ');
  await screen.findByRole('button', { name: 'Подготовить уточнение' });
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  expect(screen.queryByRole('button', { name: 'Отменить генерацию' })).not.toBeInTheDocument();
});

const guidedProposal = (canResolve) => ({ proposalId: 'guided-001', explanation: 'Учесть выбранный канал', changes: [], clarification: { gapId: 'GAP-002', answer: 'Использовать email', canResolve, remainingQuestions: canResolve ? [] : ['Какой резервный канал?'], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Канал уже отражён в требовании' }] } });

test.each([true, false])('shows the exact outcome before accepting a guided package (complete=%s)', async (complete) => {
  const proposal = guidedProposal(complete);
  mocks.get.mockResolvedValue({ messages: [], proposal });
  const apply = vi.fn(() => true);
  const { rerender } = render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" proposalDecisions={{}} onApplyProposal={apply} />);
  const label = complete ? 'Применить уточнение и закрыть вопрос' : 'Зафиксировать ответ';
  const accept = await screen.findByRole('button', { name: label, exact: true });
  expect(screen.getByText('Канал уже отражён в требовании')).toBeInTheDocument();
  if (!complete) expect(screen.getByText('Вопрос останется открытым.')).toBeInTheDocument();
  fireEvent.click(accept);
  expect(apply).toHaveBeenCalledWith(proposal);
  rerender(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" proposalDecisions={{ 'guided-001': { decision: 'accepted' } }} onApplyProposal={apply} />);
  expect(screen.getByRole('button', { name: 'Принято в черновик' })).toBeDisabled();
  rerender(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" proposalDecisions={{}} onApplyProposal={apply} />);
  expect(screen.getByRole('button', { name: label, exact: true })).toBeEnabled();
});

test('without a saved version the panel explains the prerequisite instead of a doomed create attempt', async () => {
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId={null} contextReady={false} contextError="Сначала сохраните требования, чтобы открыть AI-обсуждение." onClose={vi.fn()} />);
  await waitFor(() => expect(mocks.get).toHaveBeenCalled());
  expect(mocks.open).not.toHaveBeenCalled();
  expect(screen.getByText('Сначала сохраните требования, чтобы открыть AI-обсуждение.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Повторить загрузку' })).not.toBeInTheDocument();
});

test('a version-required refusal maps to the save-first guidance', async () => {
  mocks.open.mockRejectedValue({ status: 400, code: 'DISCUSSION_VERSION_REQUIRED', message: 'baseVersionId is required to open a new discussion' });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onClose={vi.fn()} />);
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('Сначала сохраните требования, чтобы открыть AI-обсуждение.');
  expect(screen.queryByText(/baseVersionId/)).not.toBeInTheDocument();
});

test('a stale guided package reports rejection without presenting it as accepted', async () => {
  mocks.get.mockResolvedValue({ messages: [], proposal: guidedProposal(true) });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onApplyProposal={() => false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Применить уточнение и закрыть вопрос' }));
  expect(screen.getByRole('button', { name: 'Предложение устарело' })).toBeDisabled();
  expect(screen.queryByText('Принято в черновик')).not.toBeInTheDocument();
});

test('offers saving inside the clarification panel and opens the discussion when the saved version arrives', async () => {
  const save = vi.fn();
  const { rerender } = render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId={null} contextReady={false} contextError="Сначала сохраните требования, чтобы открыть AI-обсуждение." onSaveContext={save} onSave={save} hasUnsavedChanges embedded onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Сохранить требования' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Начать уточнение' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Закрыть обсуждение' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и начать уточнение' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(mocks.open).not.toHaveBeenCalled();
  rerender(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="saved-v1" contextReady onClose={vi.fn()} />);
  await waitFor(() => expect(mocks.open).toHaveBeenCalledWith('job-1', 'GAP-002', expect.objectContaining({ baseVersionId: 'saved-v1' }), expect.objectContaining({ signal: expect.any(AbortSignal) })));
});


test('shows the recorded answer and saves the draft without leaving discussion', async () => {
  const onSave = vi.fn().mockResolvedValue({ versionId: 'v2' });
  const props = { jobId: 'job-1', anchorId: 'GAP-002', baseVersionId: 'v1', onClose: vi.fn(), onSave,
    gapStates: { 'GAP-002': { answer: 'Совмещение разрешено' } }, hasUnsavedChanges: true };
  const view = render(<DiscussionPanel {...props} />);
  await screen.findByRole('button', { name: 'Начать уточнение' });
  expect(screen.getByText('Совмещение разрешено')).toBeInTheDocument();
  expect(screen.getByText('Ваш ответ · в черновике')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(mocks.send).not.toHaveBeenCalled();
  view.rerender(<DiscussionPanel {...props} savedGapStates={props.gapStates} hasUnsavedChanges={false} />);
  expect(screen.getByText('Ваш ответ · сохранён в версии')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Сохранить требования' })).toBeDisabled();
});

test('a failed save keeps the answer visible and offers retry in the same panel', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('Не удалось сохранить версию'));
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onSave={onSave} hasUnsavedChanges gapStates={{ 'GAP-002': { answer: 'Мой ответ' } }} />);
  await screen.findByRole('button', { name: 'Начать уточнение' });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить версию');
  expect(screen.getByText('Мой ответ')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Сохранить требования' })).toBeEnabled();
});
