// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { DraftContext, SessionContext } from './review-context.js';
import { ReviewDraftProvider, ReviewSessionProvider } from './ReviewDraftProvider.jsx';

afterEach(cleanup);

function makeReview(overrides = {}) {
  return {
    state: { content: { groups: { BR: [{ id: 'BR-1', text: 'Текст черновика' }] } }, drafts: {} },
    session: { baseVersionId: 'v1', register: vi.fn(), compareRecovery: vi.fn() },
    restore: vi.fn(),
    discard: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

test('registers save, discard, and an isolated state snapshot, then unregisters on unmount', async () => {
  const review = makeReview();
  const result = render(<ReviewDraftProvider review={review} submit={review.submit}><button>Редактировать</button></ReviewDraftProvider>);

  await waitFor(() => expect(review.session.register).toHaveBeenCalledWith(expect.objectContaining({ save: review.submit, discard: review.discard })));
  const registration = review.session.register.mock.calls[0][0];
  const snapshot = registration.snapshot();
  expect(snapshot).toEqual(review.state);
  expect(snapshot).not.toBe(review.state);
  snapshot.content.groups.BR[0].text = 'Изменено в тесте';
  expect(review.state.content.groups.BR[0].text).toBe('Текст черновика');

  result.unmount();
  expect(review.session.register).toHaveBeenLastCalledWith(null);
});

test('shows a same-version recovery action and disables draft controls while busy', () => {
  const review = makeReview({
    recovery: { baseVersionId: 'v1', state: { content: { groups: {} }, drafts: {} } },
  });
  render(<ReviewDraftProvider review={review} submit={review.submit} busy><button>Сохранить</button><input aria-label="Поле" /></ReviewDraftProvider>);

  expect(screen.getByRole('status')).toHaveTextContent('Найден несохранённый черновик');
  fireEvent.click(screen.getByRole('button', { name: 'Восстановить черновик' }));
  expect(review.restore).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Поле' })).toBeDisabled();
});

test('shows changed-version comparison, draft text, discard, and storage warning', () => {
  const review = makeReview({
    storageError: true,
    recovery: {
      baseVersionId: 'old-version',
      state: {
        content: { FR: [{ id: 'FR-1', text: 'Восстановить это' }] },
        drafts: { 'BR-1': { id: 'BR-1', text: 'Правка требования' } },
      },
      baseContent: { groups: {} },
    },
  });
  render(<ReviewDraftProvider review={review} submit={review.submit}><p>Содержимое</p></ReviewDraftProvider>);

  expect(screen.getByRole('alert')).toHaveTextContent('не позволяет сохранить черновик');
  expect(screen.getByText(/версия изменилась/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Показать текст черновика'));
  expect(screen.getByText(/FR-1: Восстановить это/)).toBeInTheDocument();
  expect(screen.getByText(/BR-1: Правка требования/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сравнить и перенести' }));
  expect(review.session.compareRecovery).toHaveBeenCalledWith(review.recovery);
  fireEvent.click(screen.getByRole('button', { name: 'Отбросить черновик' }));
  expect(review.discard).toHaveBeenCalledOnce();
});

test('provides a scoped session key and the configured session callbacks', () => {
  function Probe() {
    const session = useContext(SessionContext);
    return <span>{`${session.key}|${session.baseVersionId}|${session.businessContext}`}</span>;
  }

  render(<ReviewSessionProvider scope="tenant" jobId="job-1" baseVersionId="v7" register="register" restoredState="restored" compareRecovery="compare" restoreRecovery="restore" view="review" requestView="request" reservedIds={['BR-1']} businessContext="Контекст"><Probe /></ReviewSessionProvider>);
  expect(screen.getByText('reqai.reviewDraft:tenant:job-1|v7|Контекст')).toBeInTheDocument();

  cleanup();
  render(<ReviewSessionProvider jobId="job-2"><Probe /></ReviewSessionProvider>);
  expect(screen.getByText('null|null|undefined')).toBeInTheDocument();
});
