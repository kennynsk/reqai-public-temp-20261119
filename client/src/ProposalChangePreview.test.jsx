// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ProposalChangePreview from './ProposalChangePreview.jsx';
import { DraftContext } from './review-context.js';
import { researchProposalAction } from './research-proposal-action.js';

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
