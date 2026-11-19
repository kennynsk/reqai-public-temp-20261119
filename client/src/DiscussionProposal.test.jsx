// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import DiscussionProposal from './DiscussionProposal.jsx';
import { QUALITY_POLICY } from '../../server/src/services/requirement-quality-context.js';

afterEach(cleanup);
const proposal = () => ({
  proposalId: 'resume-service', explanation: 'Клиент подтвердил возобновление. Нужно отдельное требование.', changes: [],
  clarification: { gapId: 'GAP-007', answer: 'Клиент возобновляет сервис сразу с сохранёнными настройками.', canResolve: false,
    remainingQuestions: ['Добавить отдельное требование о возобновлении сервиса.'],
    checks: [{ requirementId: 'SR-003', state: 'no-change', reason: 'Приостановка остаётся отдельной потребностью.' }] },
  qualityAssessment: { schemaVersion: QUALITY_POLICY, semanticReview: { pass: true }, assessments: [
    { id: 'BR-001', before: 'Требует уточнения', quality: 'Требует уточнения', reason: 'Не задан показатель успеха.' },
    { id: 'SR-003', before: 'Требует уточнения', quality: 'Готово', reason: 'Условие сохранения настроек определено.' },
  ] },
});

test('a no-change partial answer separates remaining work from assessment without a manual creation shortcut', () => {
  const onCreateRequirement = vi.fn(), onApply = vi.fn();
  const value = proposal();
  render(<DiscussionProposal proposal={value} onCreateRequirement={onCreateRequirement} onApply={onApply} />);
  expect(screen.getByText('Формулировки существующих требований не изменяются.')).toBeVisible();
  const remaining = screen.getByRole('region', { name: 'Что осталось сделать' });
  expect(remaining).toHaveTextContent('Добавить отдельное требование о возобновлении сервиса.');
  expect(screen.getByRole('button', { name: 'Зафиксировать ответ' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Применить уточнение и закрыть вопрос' })).not.toBeInTheDocument();
  const quality = screen.getByRole('region', { name: 'Оценка требований' });
  expect(quality).toHaveTextContent('При принятии обновятся оценки: 1');
  expect(quality).toHaveTextContent('SR-003: Требует уточнения → Готово');
  expect(quality).not.toHaveTextContent('BR-001');
  expect(quality).toHaveTextContent('открытые вопросы по задаче остаются отдельными');
  expect(screen.queryByText(/по скиллу/)).not.toBeInTheDocument();
  const reasons = screen.getByText('Почему выставлены эти оценки · 2').closest('details');
  expect(reasons).not.toHaveAttribute('open');
  expect(within(reasons).getByText('Не задан показатель успеха.')).not.toBeVisible();
  const accept = screen.getByRole('button', { name: 'Зафиксировать ответ' });
  expect(accept.compareDocumentPosition(reasons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Добавить требование по ответу' })).not.toBeInTheDocument();
  expect(onCreateRequirement).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
});

test('read-only and stale proposals cannot accept additions', () => {
  const value = proposal(); value.additions = [{ type: 'SR', record: { id: 'SR-004', text: 'Клиент возобновляет сервис.', role: 'Клиент' }, rationale: 'Отдельная потребность.' }];
  const onApply = vi.fn();
  const view = render(<DiscussionProposal proposal={value} onApply={onApply} disabled />);
  expect(screen.getByRole('button', { name: 'Применить уточнение' })).toBeDisabled();
  view.rerender(<DiscussionProposal proposal={value} onApply={onApply} stale />);
  expect(screen.getByRole('button', { name: 'Предложение устарело' })).toBeDisabled();
  expect(onApply).not.toHaveBeenCalled();
});

test('a complete no-change package can still close an already covered question', () => {
  const value = proposal(); value.clarification.canResolve = true; value.clarification.remainingQuestions = [];
  render(<DiscussionProposal proposal={value} />);
  expect(screen.getByRole('button', { name: 'Применить уточнение и закрыть вопрос' })).toBeEnabled();
  expect(screen.queryByRole('region', { name: 'Что осталось сделать' })).not.toBeInTheDocument();
});

test('partial packages name the next step in the chat and in the question panel', () => {
  const onApply = vi.fn(() => true);
  const view = render(<DiscussionProposal proposal={proposal()} canSaveHere onApply={onApply} />);
  expect(screen.getByText(/Ответьте на оставшиеся вопросы и снова нажмите «Подготовить правки»/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Зафиксировать ответ' }));
  expect(onApply).toHaveBeenCalledOnce();
  view.rerender(<DiscussionProposal proposal={proposal()} applied canSaveHere onApply={onApply} />);
  expect(screen.getByRole('status')).toHaveTextContent('Ответьте на оставшиеся вопросы');
  const exhausted = proposal(); exhausted.clarification.remainingQuestions = [];
  view.rerender(<DiscussionProposal proposal={exhausted} applied canSaveHere onApply={onApply} />);
  expect(screen.getByRole('status')).toHaveTextContent('Вернитесь к вопросу, чтобы завершить проверку');
});


test('additions-only package previews typed records and waits for the single acceptance action', () => {
  const value = proposal();
  value.additions = [{ type: 'SR', record: { id: 'SR-004', text: 'Клиенту нужно возобновлять сервис с сохранёнными настройками.', role: 'Клиент', relatedTo: ['GAP-007'] }, rationale: 'Возобновление — отдельная потребность клиента.' }];
  const onApply = vi.fn(), onReject = vi.fn(), onCreateRequirement = vi.fn();
  render(<DiscussionProposal proposal={value} onApply={onApply} onReject={onReject} onCreateRequirement={onCreateRequirement} />);
  expect(screen.getByText('Новые требования: 1.')).toBeVisible();
  const addition = screen.getByRole('article', { name: 'Новое требование SR-004' });
  expect(addition).toHaveTextContent('SR-004 · SR');
  expect(addition).toHaveTextContent('Роль: Клиент');
  expect(addition).toHaveTextContent(value.additions[0].rationale);
  expect(screen.getByText('Будут добавлены при принятии')).toBeVisible();
  expect(screen.queryByText(/Новых требований в этом предложении нет/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Зафиксировать ответ' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Добавить требование по ответу' })).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
  expect(onCreateRequirement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Применить уточнение' }));
  expect(onApply).toHaveBeenCalledOnce();
  expect(onReject).not.toHaveBeenCalled();
});

test('rejecting an additions package never applies it and mixed packages count additions separately', () => {
  const value = proposal();
  value.additions = [{ type: 'FR', record: { id: 'FR-008', text: 'Система возобновляет сервис.' }, rationale: 'Реализует потребность клиента.' }];
  value.changes = [{ targetId: 'SR-003', before: { text: 'Прежнее требование' }, after: { text: 'Уточнённое требование' } }];
  const onApply = vi.fn(), onReject = vi.fn();
  render(<DiscussionProposal proposal={value} onApply={onApply} onReject={onReject} />);
  expect(screen.getByText('Новые требования: 1. Изменения существующих требований: 1.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Отклонить предложение' }));
  expect(onReject).toHaveBeenCalledOnce();
  expect(onApply).not.toHaveBeenCalled();
});
