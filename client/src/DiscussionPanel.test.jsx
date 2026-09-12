// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), open: vi.fn(), send: vi.fn(), retry: vi.fn(), cancel: vi.fn(),
}));

vi.mock('./api/enterprise-api.js', () => ({ enterpriseApi: {
  getRequirementDiscussion: mocks.get,
  openRequirementDiscussion: mocks.open,
  sendRequirementDiscussionMessage: mocks.send,
  retryRequirementDiscussion: mocks.retry,
  cancelRequirementDiscussion: mocks.cancel,
} }));

import DiscussionPanel from './DiscussionPanel.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockRejectedValue({ status: 404 });
  mocks.open.mockResolvedValue({ discussionId: 'd1', messages: [], nextCursor: null });
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
  fireEvent.click(screen.getByRole('button', { name: 'Отклонить пакет' }));
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

const guidedProposal = (canResolve) => ({ proposalId: 'guided-001', explanation: 'Учесть выбранный канал', changes: [], clarification: { gapId: 'GAP-002', answer: 'Использовать email', canResolve, remainingQuestions: canResolve ? [] : ['Какой резервный канал?'], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Канал уже отражён в требовании' }] } });

test.each([true, false])('shows the exact outcome before accepting a guided package (complete=%s)', async (complete) => {
  const proposal = guidedProposal(complete);
  mocks.get.mockResolvedValue({ messages: [], proposal });
  const apply = vi.fn(() => true);
  const { rerender } = render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" proposalDecisions={{}} onApplyProposal={apply} />);
  const label = complete ? 'Применить уточнение и закрыть вопрос' : 'Применить уточнение';
  const accept = await screen.findByRole('button', { name: label, exact: true });
  expect(screen.getByText('Канал уже отражён в требовании')).toBeInTheDocument();
  if (!complete) expect(screen.getByText('Вопрос останется открытым')).toBeInTheDocument();
  fireEvent.click(accept);
  expect(apply).toHaveBeenCalledWith(proposal);
  rerender(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" proposalDecisions={{ 'guided-001': { decision: 'accepted' } }} onApplyProposal={apply} />);
  expect(screen.getByRole('button', { name: 'Принято в черновик' })).toBeDisabled();
  rerender(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" proposalDecisions={{}} onApplyProposal={apply} />);
  expect(screen.getByRole('button', { name: label, exact: true })).toBeEnabled();
});

test('a stale guided package reports rejection without presenting it as accepted', async () => {
  mocks.get.mockResolvedValue({ messages: [], proposal: guidedProposal(true) });
  render(<DiscussionPanel jobId="job-1" anchorId="GAP-002" baseVersionId="v1" onApplyProposal={() => false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Применить уточнение и закрыть вопрос' }));
  expect(screen.getByRole('button', { name: 'Предложение устарело' })).toBeDisabled();
  expect(screen.queryByText('Принято в черновик')).not.toBeInTheDocument();
});
