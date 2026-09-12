// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DraftContext } from './review-context.js';
import ReviewQuestions from './ReviewQuestions.jsx';

afterEach(cleanup);

function makeRegistry() {
  return {
    materials: { primary: { artifactId: 'primary', name: 'Бриф' } },
    analysis: {
      GAP: [
        { id: 'GAP-OPEN', text: 'Открытый вопрос', affectedIds: ['BR-1'], nextStep: 'Уточнить владельца', source: { artifactId: 'primary', locator: 'paragraph:1', quote: 'Кто отвечает?' } },
        { id: 'GAP-ANSWERED', text: 'Вопрос с ответом', affectedIds: [], source: null },
        { id: 'GAP-CLOSED', text: 'Закрытый вопрос', affectedIds: ['FR-1'], source: { artifactId: 'primary', locator: 'manual-review' } },
      ],
      questions: [
        { id: 'Q-0', gapId: 'GAP-OPEN', priority: 'P0', addressee: 'Владелец', text: 'Кто принимает решение?' },
        { id: 'Q-1', gapId: 'GAP-OPEN', priority: 'P1', addressee: 'Аналитик', text: 'Как проверить?' },
        { id: 'Q-2', gapId: 'GAP-ANSWERED', priority: 'P2', addressee: 'Команда', text: 'Когда запуск?' },
        { id: 'Q-X', gapId: 'GAP-CLOSED', priority: 'PX', addressee: 'Команда', text: 'Что изменилось?' },
      ],
    },
  };
}

function makeReview(dispatch = vi.fn()) {
  return {
    state: {
      decisions: {
        review: {
          gaps: {
            'GAP-ANSWERED': { state: 'answered', answer: 'Ответ владельца' },
            'GAP-CLOSED': { state: 'closed', answer: 'Решено', reason: 'Подтверждено', recordedAt: '2026-08-30T10:00:00Z' },
          },
        },
      },
    },
    dispatch,
  };
}

test('edits answers, shows priorities, navigates links, and records open/close decisions', () => {
  const dispatch = vi.fn();
  const onNavigate = vi.fn();
  const registry = makeRegistry();
  render(<DraftContext.Provider value={makeReview(dispatch)}><ReviewQuestions registry={registry} onNavigate={onNavigate} /></DraftContext.Provider>);

  expect(screen.getByRole('heading', { name: 'Вопросы для уточнения · 4' })).toBeInTheDocument();
  expect(screen.getByText(/AI поможет разобраться/)).toBeInTheDocument();
  expect(screen.getByText('Открыт')).toBeInTheDocument();
  expect(screen.getByText('Дан ответ · ещё открыт')).toBeInTheDocument();
  expect(screen.getByText('Закрыт')).toBeInTheDocument();
  expect(screen.getByText('Следующий шаг: Уточнить владельца')).toBeInTheDocument();
  expect(screen.getByText(/Критический · Владелец/)).toBeInTheDocument();
  expect(screen.getByText(/Высокий · Аналитик/)).toBeInTheDocument();
  expect(screen.getByText(/Обычный · Команда/)).toBeInTheDocument();
  expect(screen.getByText(/Приоритет не указан · Команда/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'BR-1' }));
  expect(onNavigate).toHaveBeenCalledWith('BR-1');
  const openArticle = screen.getByText('GAP-OPEN · Открытый вопрос').closest('article');
  const answer = within(openArticle).getByRole('textbox', { name: 'Ответ на GAP-OPEN' });
  fireEvent.change(answer, { target: { value: '' } });
  fireEvent.change(answer, { target: { value: 'Новый ответ' } });
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'decisions' }));
  expect(within(screen.getByText('GAP-CLOSED · Закрытый вопрос').closest('article')).getByRole('textbox')).toBeDisabled();

  fireEvent.click(within(openArticle).getByRole('button', { name: 'Закрыть без изменения требований…' }));
  const decisionDialog = screen.getByRole('dialog', { name: 'Решение по вопросу' });
  const confirm = within(decisionDialog).getByRole('button', { name: 'Подтвердить решение' });
  expect(confirm).toBeDisabled();
  fireEvent.keyDown(decisionDialog, { key: 'Escape' });
  fireEvent.click(within(openArticle).getByRole('button', { name: 'Закрыть без изменения требований…' }));
  const reopenedDecisionDialog = screen.getByRole('dialog', { name: 'Решение по вопросу' });
  fireEvent.change(within(reopenedDecisionDialog).getByRole('textbox', { name: 'Причина решения' }), { target: { value: 'Согласовано с владельцем' } });
  fireEvent.click(within(reopenedDecisionDialog).getByRole('button', { name: 'Подтвердить решение' }));

  const closedArticle = screen.getByText('GAP-CLOSED · Закрытый вопрос').closest('article');
  fireEvent.click(within(closedArticle).getByRole('button', { name: 'Открыть вопрос снова' }));
  expect(screen.getByRole('heading', { name: 'Снова открыть GAP-CLOSED' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  fireEvent.click(within(closedArticle).getByRole('button', { name: 'Открыть вопрос снова' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Причина решения' }), { target: { value: 'Нужно пересмотреть' } });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить решение' }));

  fireEvent.click(screen.getAllByText('Источник вопроса')[0]);
  expect(screen.getByText('Кто отвечает?')).toBeInTheDocument();
  expect(within(screen.getByText('GAP-ANSWERED · Вопрос с ответом').closest('article')).queryByText('Источник вопроса')).not.toBeInTheDocument();
  expect(screen.queryByText('Источник не указан')).not.toBeInTheDocument();
});

test('filters closed and open questions and renders read-only answers', () => {
  const registry = makeRegistry();
  const review = makeReview();
  const result = render(<DraftContext.Provider value={review}><ReviewQuestions registry={registry} onNavigate={vi.fn()} /></DraftContext.Provider>);
  const filter = screen.getByRole('combobox', { name: 'Статус вопросов' });
  fireEvent.change(filter, { target: { value: 'closed' } });
  expect(screen.getByText('GAP-CLOSED · Закрытый вопрос')).toBeInTheDocument();
  expect(screen.queryByText('GAP-OPEN · Открытый вопрос')).not.toBeInTheDocument();
  fireEvent.change(filter, { target: { value: 'open' } });
  expect(screen.getByText('GAP-OPEN · Открытый вопрос')).toBeInTheDocument();
  expect(screen.queryByText('GAP-CLOSED · Закрытый вопрос')).not.toBeInTheDocument();

  result.unmount();
  render(<DraftContext.Provider value={review}><ReviewQuestions registry={registry} readOnly onNavigate={vi.fn()} /></DraftContext.Provider>);
  expect(screen.getByText('Ответ: Ответ владельца')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Ответ на GAP-ANSWERED' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Закрыть без изменения требований…' })).not.toBeInTheDocument();
});

test('shows a safe empty state when there are no questions', () => {
  render(<DraftContext.Provider value={null}><ReviewQuestions registry={{ analysis: { GAP: [], questions: [] }, materials: {} }} readOnly onNavigate={vi.fn()} /></DraftContext.Provider>);
  expect(screen.getByText('В этом списке нет вопросов.')).toBeInTheDocument();
});
