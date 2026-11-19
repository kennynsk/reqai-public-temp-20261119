// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ProposalChangePreview from './ProposalChangePreview.jsx';
import { DraftContext } from './review-context.js';
import { researchProposalAction, researchProposalFields } from './research-proposal-action.js';

afterEach(cleanup);
const enhancement = { key: 'i:0', operation: 'replace', targetType: 'FR', targetId: 'FR-001', text: 'Новая формулировка' };
const context = { content: { groups: { FR: [{ id: 'FR-001', text: 'Исходная формулировка' }] } }, state: { decisions: {} } };
test('shows before and after for explicit replacement', () => {
  render(<DraftContext.Provider value={context}><ProposalChangePreview enhancement={enhancement} /></DraftContext.Provider>);
  for (const text of ['Было', 'Стало', 'Исходная формулировка', 'Новая формулировка']) expect(screen.getByText(text)).toBeInTheDocument();
});
test('saved decisions override model intent and preserve original before text after application', () => {
  const reviewed = { ...context, state: { decisions: { review: { proposals: { 'i:0': { operation: 'replace', targetType: 'FR', targetId: 'FR-001', decision: 'accepted', before: { text: 'Историческая формулировка' }, after: { text: 'Проверенная формулировка' } } } } } } };
  render(<DraftContext.Provider value={reviewed}><ProposalChangePreview enhancement={{ ...enhancement, operation: 'add' }} /></DraftContext.Provider>);
  expect(screen.getByText('Историческая формулировка')).toBeInTheDocument();
  expect(screen.getByText('Проверенная формулировка')).toBeInTheDocument();
});
test('legacy contextual links do not select replacement', () => {
  expect(researchProposalAction({ targetType: 'FR', targetIds: ['FR-001'] }, context).operation).toBeUndefined();
});

test('shows a metric-only replacement instead of repeating unchanged goal text', () => {
  const original = { id: 'BR-001', text: 'Увеличить регулярность накоплений', successIndicator: null };
  const metric = { key: 'metric', operation: 'replace', targetType: 'BR', targetId: 'BR-001', text: original.text, successIndicator: 'Доля клиентов с пополнением каждый месяц' };
  render(<DraftContext.Provider value={{ content: { groups: { BR: [original] } }, state: { decisions: {} } }}><ProposalChangePreview enhancement={metric} /></DraftContext.Provider>);
  expect(screen.getByRole('region', { name: 'Изменение: Критерий успеха' })).toHaveTextContent(metric.successIndicator);
  expect(screen.getByText('Не задано')).toBeInTheDocument();
  expect(screen.queryByText(original.text)).not.toBeInTheDocument();
});
test('does not display a before-after comparison for unchanged proposals', () => {
  render(<DraftContext.Provider value={context}><ProposalChangePreview enhancement={{ ...enhancement, text: 'Исходная формулировка' }} /></DraftContext.Provider>);
  expect(screen.getByText(/Изменений нет/)).toBeInTheDocument();
  expect(screen.queryByText('Было')).not.toBeInTheDocument();
});

test('structured replacement inherits omitted fields but preserves an explicit clearing', () => {
  expect(researchProposalFields({ targetType: 'NFR', verificationMethod: 'Повторить запрос', scope: null }, { category: 'Надёжность', scope: 'Переводы', verificationMethod: 'Старый тест' })).toMatchObject({ category: 'Надёжность', scope: null, verificationMethod: 'Повторить запрос' });
});
