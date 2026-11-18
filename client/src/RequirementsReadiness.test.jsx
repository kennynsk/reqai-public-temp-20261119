// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RequirementsReadiness from './RequirementsReadiness.jsx';
import { decompositionCoverage } from '../../server/src/services/decomposition-coverage.js';
afterEach(cleanup);
const registry = { groups: { BR: [{ id: 'BR-001', quality: 'Готово', relatedIds: ['SR-001'] }], SR: [{ id: 'SR-001', quality: 'Готово', relatedTo: ['BR-001'] }], FR: [{ id: 'FR-001', quality: 'Готово', relatedTo: ['SR-001'] }, { id: 'FR-002', quality: 'Готово', relatedTo: [] }] }, analysis: { GAP: [{ id: 'GAP-001', text: 'Добавить отсутствующее требование выбора режима.' }] } };
test('all existing formulations can be ready while decomposition remains incomplete and questions stay accessible', () => {
  const onQuestions = vi.fn(), onLinks = vi.fn();
  render(<RequirementsReadiness registry={registry} decisions={{ review: { gaps: { 'GAP-001': { state: 'answered', answer: 'Режим выбирается до исполнения.' } } } }} onQuestions={onQuestions} onLinks={onLinks} />);
  expect(screen.queryByRole('region', { name: 'Качество и полнота требований' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Полнота декомпозиции')).toHaveTextContent('Декомпозиция неполная');
  fireEvent.click(screen.getByRole('button', { name: 'Открытых вопросов: 1' }));
  expect(onQuestions).toHaveBeenCalledOnce();
});
test('closed questions do not conceal orphan requirements, omissions, or partially processed sources', () => {
  const decisions = { review: { gaps: { 'GAP-001': { state: 'closed' } }, omissions: [{ id: 'omission', text: 'Не добавлена функция.', requirementIds: [] }] } };
  const coverage = decompositionCoverage({ ...registry, scope: { partial: true } }, decisions);
  expect(coverage).toMatchObject({ ready: 4, openGaps: [], incomplete: true, partialSource: true });
  expect(coverage.breaks).toHaveLength(1); expect(coverage.omissions).toHaveLength(1);
  const covered = structuredClone(registry); covered.groups.FR[1].relatedTo = ['BR-001'];
  expect(decompositionCoverage(covered, { review: { gaps: { 'GAP-001': { state: 'closed' } } } }).incomplete).toBe(false);
});

test('inferred links keep their provenance without triggering a completeness warning', () => {
  const content = { groups: { BR: [{ id: 'BR-001', relatedIds: ['TR-001'], quality: 'Готово' }], TR: [{ id: 'TR-001', relatedTo: ['BR-001'], quality: 'Готово' }] }, analysis: { traceability: [{ from: 'BR-001', to: 'TR-001', relation: 'обосновывает', status: 'Предполагается' }] } };
  expect(decompositionCoverage(content)).toMatchObject({ breaks: [], incomplete: false, unconfirmedLinks: content.analysis.traceability });
  render(<RequirementsReadiness registry={content} />);
  expect(screen.queryByRole('button', { name: 'Проверить связи' })).not.toBeInTheDocument();
  content.analysis.GAP = [{ id: 'GAP-001', text: 'Какой канал нужен?' }];
  expect(decompositionCoverage(content).incomplete).toBe(true);
  content.analysis.GAP = [];
  content.analysis.traceability[0].status = 'Подтверждено источником';
  expect(decompositionCoverage(content)).toMatchObject({ breaks: [], incomplete: false });
});

test('confirmed instructions to add requirements count as missing work, not existing coverage', () => {
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer: 'Выбирать режим перед исполнением.' } }, discussionProposals: { accepted: { decision: 'accepted', clarification: { gapId: 'GAP-001', answer: 'Выбирать режим перед исполнением.', canResolve: false, remainingQuestions: ['Добавить отдельное требование о выборе режима.'] } } } } };
  const coverage = decompositionCoverage(registry, decisions);
  expect(coverage.pendingRequirements).toEqual([{ gapId: 'GAP-001', text: 'Добавить отдельное требование о выборе режима.' }]);
  expect(coverage.total).toBe(4); expect(coverage.ready).toBe(4); expect(coverage.incomplete).toBe(true);
});
