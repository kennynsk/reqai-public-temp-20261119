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
  expect(mocks.send).toHaveBeenCalledWith('job-1', 'GAP-002', expect.objectContaining({ message: 'Уточнить', baseVersionId: 'v1' }));
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
