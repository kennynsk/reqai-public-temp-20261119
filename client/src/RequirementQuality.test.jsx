// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DraftContext } from './review-context.js';
import RequirementQuality from './RequirementQuality.jsx';
import { roomBookingRegistry } from './room-booking.fixture.js';

afterEach(cleanup);

function setup(metadata = {}, extra = {}, registry = roomBookingRegistry()) {
  const requirement = { ...registry.groups.BR[0], quality: 'Требует уточнения', ...extra.requirement };
  const onReview = vi.fn(), onShowQuestions = vi.fn();
  render(<DraftContext.Provider value={{ content: registry, state: { decisions: { review: metadata } } }}>
    <RequirementQuality type="BR" requirement={requirement} onReview={onReview} onShowQuestions={onShowQuestions} {...extra} />
  </DraftContext.Provider>);
  return { requirement, onReview, onShowQuestions };
}

test('shows missing fields and directs to the existing questions without duplicating them', () => {
  const { onReview, onShowQuestions } = setup();
  expect(screen.getByText(/Не заполнено:/).parentElement).toHaveTextContent('критерий успеха');
  expect(screen.queryByText(/GAP-001/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Канал уведомлений/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Показать связанные вопросы' }));
  expect(onShowQuestions).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить формулировку и оценку' }));
  expect(onReview).toHaveBeenCalledOnce();
});

test('no-change confirmation does not duplicate the checklist or hide the still-open questions', () => {
  setup({ gapRequirements: { 'GAP-001': { 'BR-001': { state: 'no-change', reason: 'Канал не влияет на бизнес-цель' } } } });
  expect(screen.getByRole('button', { name: 'Показать связанные вопросы' })).toBeInTheDocument();
  expect(screen.queryByText(/Канал не влияет на бизнес-цель/)).not.toBeInTheDocument();
});

test('closed questions explain the remaining assessment without changing quality', () => {
  const registry = roomBookingRegistry();
  const metadata = { gaps: Object.fromEntries(registry.analysis.GAP.map((gap) => [gap.id, { state: 'closed' }])) };
  const { requirement } = setup(metadata);
  expect(screen.getByText(/Все связанные вопросы закрыты/)).toHaveTextContent('Проверьте формулировку и оценку качества');
  expect(screen.queryByRole('button', { name: 'Показать связанные вопросы' })).not.toBeInTheDocument();
  expect(requirement.quality).toBe('Требует уточнения');
});

test('ready wording can still have open questions, and read-only mode has no edit action', () => {
  setup({}, { requirement: { ...roomBookingRegistry().groups.BR[0], quality: 'Готово', successIndicator: 'Нет конфликтов' }, readOnly: true });
  expect(screen.getByText(/Формулировка отмечена как готовая/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Показать связанные вопросы' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Проверить формулировку и оценку' })).not.toBeInTheDocument();
});

test('does not invent a reason when an old assessment has no linked question', () => {
  const registry = roomBookingRegistry();
  registry.analysis.GAP = [];
  setup({}, {}, registry);
  expect(screen.getByText(/связанная причина не указана/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Показать связанные вопросы' })).not.toBeInTheDocument();
});

test('a complete ready requirement has no redundant quality explanation', () => {
  const registry = roomBookingRegistry();
  registry.analysis.GAP = [];
  setup({}, { requirement: { ...registry.groups.BR[0], quality: 'Готово', successIndicator: 'Нет конфликтов' } }, registry);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
