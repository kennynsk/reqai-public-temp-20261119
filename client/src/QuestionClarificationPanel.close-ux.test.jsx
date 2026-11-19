// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

import { BabokRegistryResult } from './AsyncJobWorkspace.jsx';
import { sharedQuestionFixture } from './question-clarification.fixture.js';
import { RequirementsReviewContext } from './requirements-review-context.js';
import { ReviewSessionProvider } from './ReviewDraftProvider.jsx';

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); sessionStorage.clear(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockRejectedValue({ status: 404 });
  mocks.open.mockResolvedValue({ discussionId: 'd1', messages: [], nextCursor: null });
  mocks.subscribe.mockReturnValue(new Promise(() => {}));
});

const checkedIds = ['BR-001', 'SR-001', ...Array.from({ length: 8 }, (_, i) => `FR-${String(i + 1).padStart(3, '0')}`)];
const answer = 'Уведомления по электронной почте, повторная попытка через час.';
function answeredDecisions({ objection = true } = {}) {
  return { review: {
    gaps: { 'GAP-001': { state: 'answered', answer } },
    gapRequirements: { 'GAP-001': Object.fromEntries(checkedIds.map((id) => [id, { state: 'incorporated', reason: '' }])) },
    ...(objection ? { discussionProposals: { p1: { decision: 'accepted', changes: [], recordedAt: '2026-10-01T00:00:00Z', clarification: { gapId: 'GAP-001', answer, canResolve: false, remainingQuestions: ['Как обрабатывать недоставленные уведомления?'] } } } } : {}),
  } };
}
function setup({ registry = sharedQuestionFixture(), decisions = {}, workflow = {}, ...props } = {}) {
  const save = vi.fn();
  const tree = <ReviewSessionProvider scope="close-ux" jobId="shared" baseVersionId="v1"><RequirementsReviewContext.Provider value={workflow}><BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} {...props} /></RequirementsReviewContext.Provider></ReviewSessionProvider>;
  render(tree);
  return { save };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Разобрать вопрос' }));

test('a human can close the question over an AI objection, recording both positions', () => {
  const { save } = setup({ decisions: answeredDecisions() }); open();
  expect(screen.getByRole('button', { name: 'Закрыть как решённый' })).toBeDisabled();
  expect(screen.getByText('AI считает уточнение неполным')).toBeVisible();
  expect(screen.getByText('Как обрабатывать недоставленные уведомления?')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Не согласен — вопрос выяснен, закрыть' }));
  expect(screen.getByRole('button', { name: 'Подтвердить решение' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Почему вопрос можно закрыть'), { target: { value: 'Недоставку повторов уже покрывает существующее требование.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить решение' }));
  expect(screen.getByRole('button', { name: 'Открыть вопрос снова' })).toBeVisible();
  const recorded = screen.getByText(/Причина решения:/);
  expect(recorded).toHaveTextContent('недоставленные уведомления');
  expect(recorded).toHaveTextContent('Недоставку повторов');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  expect(save.mock.calls[0][0].decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', closureKind: 'resolved' });
});

test('closing without an AI objection records the attested checklist', () => {
  setup({ decisions: answeredDecisions({ objection: false }) }); open();
  expect(screen.getByRole('button', { name: 'Закрыть как решённый' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть как решённый' }));
  expect(screen.getByRole('button', { name: 'Открыть вопрос снова' })).toBeVisible();
  expect(screen.getByText(/Причина решения:/)).toHaveTextContent('Проверены все связанные требования');
});

test('the AI chat view leaves manual closure controls out of the way while awaiting an answer', () => {
  setup({ jobId: 'shared' }); open();
  fireEvent.click(screen.getByRole('button', { name: 'Разобрать с AI' }));
  expect(screen.getByText('Ожидает ответа')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Закрыть как решённый' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Снять с рассмотрения…' })).not.toBeInTheDocument();
});

test('the AI chat view offers the human override when only the AI objection blocks closing', () => {
  setup({ jobId: 'shared', decisions: answeredDecisions() }); open();
  fireEvent.click(screen.getByRole('button', { name: 'Разобрать с AI' }));
  expect(screen.getByRole('status', { name: 'Статус проверки GAP-001' })).toHaveTextContent('Осталось выяснить');
  expect(screen.getByRole('button', { name: 'Не согласен — вопрос выяснен, закрыть' })).toBeVisible();
});

test('soft-invalidated decisions reconfirm in one click and then close', () => {
  const decisions = { review: {
    gaps: { 'GAP-001': { state: 'answered', answer, stale: true, reason: 'Изменился внешний контекст: CON-001.' } },
    gapRequirements: { 'GAP-001': Object.fromEntries(checkedIds.map((id) => [id, { state: 'incorporated', reason: '', stale: true }])) },
  } };
  setup({ decisions }); open();
  expect(screen.getByRole('status', { name: 'Статус проверки GAP-001' })).toHaveTextContent('повторного подтверждения');
  const close = screen.getByRole('button', { name: 'Закрыть как решённый' });
  expect(close).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить прежние решения' }));
  expect(close).toBeEnabled();
  fireEvent.click(close);
  expect(screen.getByRole('button', { name: 'Открыть вопрос снова' })).toBeVisible();
});

test('a draft edit that reopens saved questions warns on the main screen before saving', async () => {
  const decisions = { review: {
    gaps: { 'GAP-001': { state: 'closed', closureKind: 'resolved', answer } },
    gapRequirements: { 'GAP-001': Object.fromEntries(checkedIds.map((id) => [id, { state: 'incorporated', reason: '' }])) },
  } };
  setup({ decisions }); open();
  fireEvent.click(screen.getByRole('button', { name: /^Связанные требования ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать FR-004' }));
  fireEvent.change(screen.getByLabelText('Текст требования FR-004'), { target: { value: 'Обновлённая формулировка требования.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));
  await waitFor(() => expect(screen.getByText(/Правка переоткроет вопросы: GAP-001/)).toBeVisible());
  expect(screen.getByRole('button', { name: 'Подтвердить прежние решения' })).toBeVisible();
  expect(screen.getByRole('status', { name: 'Статус проверки GAP-001' })).toHaveTextContent('Нужна повторная проверка');
});
