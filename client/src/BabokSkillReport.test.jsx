// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import BabokSkillReport from './BabokSkillReport.jsx';
import fixture from '../../server/test/fixtures/babok-requirements-v1.complete.json';

test('full skill report renders every section as headings and real tables', () => {
  render(<BabokSkillReport registry={fixture} />);
  const report = screen.getByRole('region', { name: 'Полный отчёт по скиллу BABOK' });
  expect(within(report).getAllByRole('heading', { level: 2 })).toHaveLength(12);
  expect(within(report).getAllByRole('table').length).toBeGreaterThanOrEqual(9);
  expect(within(report).getByRole('heading', { name: '11. Вопросы для уточнения' })).toBeTruthy();
  expect(within(report).getByText('Кто утверждает показатель успеха?', { exact: false }).textContent).toBeTruthy();
});

test('the report and its download content reflect current answers, closed gaps and partial remaining questions', () => {
  const gapId = fixture.analysis.GAP[0].id;
  const review = { gaps: { [gapId]: { state: 'closed', answer: 'Решение владельца продукта подтверждено', reason: 'Проверены требования' } } };
  const { rerender } = render(<BabokSkillReport registry={fixture} review={review} />);
  expect(screen.getAllByText('Закрыт').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Решение владельца продукта подтверждено').length).toBeGreaterThan(0);
  expect(screen.getByText('Вопрос закрыт')).toBeInTheDocument();
  const partial = { gaps: { [gapId]: { state: 'answered', answer: 'Подтверждён только канал' } }, discussionProposals: { p1: { decision: 'accepted', clarification: { gapId, answer: 'Подтверждён только канал', remainingQuestions: ['Уточнить резервный канал'] } } } };
  rerender(<BabokSkillReport registry={fixture} review={partial} />);
  expect(screen.getByText('Уточнить резервный канал')).toBeInTheDocument();
  expect(screen.queryByText('Вопрос закрыт')).not.toBeInTheDocument();
});
