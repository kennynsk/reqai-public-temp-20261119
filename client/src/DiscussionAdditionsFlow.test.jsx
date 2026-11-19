// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import DiscussionProposal from './DiscussionProposal.jsx';
import { BabokRegistryResult } from './AsyncJobWorkspace.jsx';
import { sharedQuestionFixture } from './question-clarification.fixture.js';
import { ReviewSessionProvider } from './ReviewDraftProvider.jsx';
import { buildDiscussionContext, validateDiscussionProposal } from '../../server/src/services/requirement-discussion-service.js';
import { normalizeReviewMetadata } from '../../server/src/services/review-metadata.js';
import { qualityAssessmentContext, QUALITY_POLICY } from '../../server/src/services/requirement-quality-context.js';

const flow = vi.hoisted(() => ({ proposal: null, accepted: null }));
vi.mock('./DiscussionPanel.jsx', () => ({ default: ({ onApplyProposal, onRejectProposal, onSave }) => <div>
  <button onClick={() => { flow.accepted = onApplyProposal(flow.proposal); }}>Принять тестовое предложение</button>
  <button onClick={() => onRejectProposal(flow.proposal)}>Отклонить тестовое предложение</button>
  <button onClick={() => onSave()}>Сохранить тестовую версию</button>
</div> }));

afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState({}, '', '/'); flow.proposal = null; flow.accepted = null; });
function fixture({ partial = false } = {}) {
  const registry = sharedQuestionFixture();
  registry.analysis.GAP[0].affectedIds = ['SR-001'];
  registry.groups.BR[0].relatedIds = [];
  for (const record of registry.groups.FR) record.relatedTo = [];
  const snapshot = buildDiscussionContext({ content: registry, anchorId: 'GAP-001', baseVersionId: 'v1' });
  const proposal = validateDiscussionProposal({
    explanation: 'Добавить подтверждённую потребность клиента.', changes: [],
    additions: [{ type: 'SR', fields: { text: 'Клиенту нужна возможность возобновить сервис с сохранёнными настройками.', role: 'Клиент' }, rationale: 'Пользователь подтвердил возобновление.' }],
    clarification: { gapId: 'GAP-001', answer: 'Клиент возобновляет сервис с сохранёнными настройками.', remainingQuestions: partial ? ['Когда разрешено возобновление после блокировки?'] : [], checks: [{ requirementId: 'SR-001', state: 'no-change', reason: 'Исходная потребность сохраняется.' }] },
  }, { content: snapshot, registry, reservedIds: [] });
  proposal.proposalId = 'add-resume-service';
  proposal.baseVersionId = 'v1';
  const records = [...Object.entries(registry.groups).flatMap(([type, group]) => group.map((record) => ({ type, ...record }))), ...proposal.additions.map(({ type, record }) => ({ type, ...record }))];
  proposal.qualityAssessment = {
    schemaVersion: QUALITY_POLICY, revision: 'test-review', basis: qualityAssessmentContext(registry, {}), assessedRecords: records,
    assessments: records.map((record) => ({ id: record.id, before: record.quality, quality: record.quality, reason: 'Формулировка проверена по тексту требования.', blockingGapIds: [], evidence: [{ recordId: record.id, field: 'text', quote: record.text }] })),
    semanticReview: { schemaVersion: 'babok-quality-review.v1', revision: 'test-review', pass: true, checks: records.map((record) => ({ id: record.id, pass: true, issues: [] })) },
  };
  return { registry, proposal };
}
function setup({ collision = false, partial = false, priorValidity = null } = {}) {
  const { registry, proposal } = fixture({ partial });
  if (collision) proposal.additions[0].record.id = 'SR-001';
  const decisions = {};
  if (priorValidity) {
    const priorGap = { ...registry.analysis.GAP[0], id: 'GAP-002', text: 'Как учитываются возвраты?', affectedIds: [] };
    registry.analysis.GAP.push(priorGap);
    const priorAnswer = { state: 'closed', stale: false, answer: 'Накопления сохраняются при возврате.' };
    decisions.review = { schemaVersion: 1, gaps: { 'GAP-002': { ...priorAnswer, ...priorValidity } } };
    proposal.gapBases = { ...(proposal.gapBases || {}), 'GAP-002': { question: priorGap.text, ...priorAnswer } };
    // Deliberately current: only gapBases can detect the older answer validity.
    proposal.qualityAssessment.basis = qualityAssessmentContext(registry, decisions);
  }
  flow.proposal = proposal;
  const save = vi.fn();
  render(<ReviewSessionProvider scope="additions" jobId="shared" baseVersionId="v1"><BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} jobId="shared" initialRecordId="GAP-001" /></ReviewSessionProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Разобрать с AI' }));
  return { registry, proposal, save };
}
const accept = () => fireEvent.click(screen.getByRole('button', { name: 'Принять тестовое предложение' }));
const saveVersion = () => fireEvent.click(screen.getByRole('button', { name: 'Сохранить тестовую версию' }));

test('accepted additions, answer, closure and new checks reach one server-valid saved version; repeated acceptance is idempotent', () => {
  const { registry, proposal, save } = setup();
  expect(registry.groups.SR).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Редактировать SR-002' })).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  accept();
  expect(flow.accepted).toBe(true);
  accept();
  expect(flow.accepted).toBe(true);
  saveVersion();
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups.SR).toHaveLength(2);
  expect(payload.registry.groups.SR[1]).toEqual(proposal.additions[0].record);
  expect(payload.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', closureKind: 'resolved', answer: proposal.clarification.answer });
  expect(payload.decisions.review.gapRequirements['GAP-001']['SR-002']).toMatchObject({ state: 'incorporated', stale: false });
  expect(payload.decisions.review.discussionProposals[proposal.proposalId].additions).toEqual(proposal.additions);
  const normalized = normalizeReviewMetadata({ content: payload.registry, baseContent: registry, supplied: payload.decisions.review, allowedGaps: payload.registry.analysis.GAP, contextId: registry.materials.primary.artifactId, actorId: 'test-reviewer', now: new Date('2026-10-14T12:00:00Z') });
  expect(normalized.gaps['GAP-001'].state).toBe('closed');
  expect(normalized.discussionProposals[proposal.proposalId].additions).toEqual(proposal.additions);
});

test('rejecting proposed additions records rejection without creating records or answers', () => {
  const { registry, proposal, save } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Отклонить тестовое предложение' }));
  saveVersion();
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups).toEqual(registry.groups);
  expect(payload.decisions.review.gaps?.['GAP-001']).toBeUndefined();
  expect(payload.decisions.review.discussionProposals[proposal.proposalId].decision).toBe('rejected');
});

test('a proposed new ID collision fails without creating or accepting anything', () => {
  const { registry, proposal, save } = setup({ collision: true });
  accept();
  expect(flow.accepted).toBe(false);
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('идентификатор нового требования уже занят');
  saveVersion();
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups).toEqual(registry.groups);
  expect(payload.decisions.review?.discussionProposals?.[proposal.proposalId]).toBeUndefined();
});


test('editing a newly accepted requirement reopens its question and saves a superseded receipt', () => {
  const { registry, proposal, save } = setup();
  accept();
  expect(flow.accepted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '← К вопросу GAP-001' }));
  fireEvent.click(screen.getByRole('button', { name: /^Связанные требования ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать SR-002' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования SR-002' }), { target: { value: 'Клиенту нужна возможность возобновить сервис после подтверждения с сохранёнными настройками.' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Применить к черновику' }));
  expect(screen.getByRole('button', { name: 'Закрыть как решённый' })).toBeDisabled();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить требования' }));
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups.SR[1].text).toContain('после подтверждения');
  expect(payload.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'answered', closureKind: null, stale: true });
  expect(payload.decisions.review.discussionProposals[proposal.proposalId].superseded).toBe(true);
  const normalized = normalizeReviewMetadata({ content: payload.registry, baseContent: registry, supplied: payload.decisions.review, allowedGaps: payload.registry.analysis.GAP, contextId: registry.materials.primary.artifactId, actorId: 'test-reviewer', now: new Date('2026-10-14T12:00:00Z') });
  expect(normalized.gaps['GAP-001'].state).toBe('answered');
  expect(normalized.discussionProposals[proposal.proposalId].superseded).toBe(true);
});

test('a partial package creates its requirement while keeping the unanswered question open after saving', () => {
  const { registry, proposal, save } = setup({ partial: true });
  expect(proposal.clarification.canResolve).toBe(false);
  accept();
  expect(flow.accepted).toBe(true);
  saveVersion();
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups.SR).toHaveLength(2);
  expect(payload.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'answered', closureKind: null });
  expect(payload.decisions.review.gapRequirements['GAP-001']['SR-002'].state).toBe('incorporated');
  const normalized = normalizeReviewMetadata({ content: payload.registry, baseContent: registry, supplied: payload.decisions.review, allowedGaps: payload.registry.analysis.GAP, contextId: registry.materials.primary.artifactId, actorId: 'test-reviewer', now: new Date('2026-10-14T12:00:00Z') });
  expect(normalized.gaps['GAP-001'].state).toBe('answered');
  expect(normalized.discussionProposals[proposal.proposalId].clarification.remainingQuestions).toEqual(['Когда разрешено возобновление после блокировки?']);
});


test.each([{ state: 'answered' }, { stale: true }])('prior-answer validity change %j blocks acceptance even when text and quality basis match', (priorValidity) => {
  const { registry, proposal, save } = setup({ priorValidity });
  accept();
  expect(flow.accepted).toBe(false);
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('статус проверки');
  expect(within(screen.getByRole('dialog')).getByRole('alert')).not.toHaveTextContent('Оценка качества устарела');
  saveVersion();
  const payload = save.mock.calls[0][0];
  expect(payload.registry.groups).toEqual(registry.groups);
  expect(payload.decisions.review.discussionProposals?.[proposal.proposalId]).toBeUndefined();
  expect(payload.decisions.review.gaps['GAP-002'].answer).toBe(proposal.gapBases['GAP-002'].answer);
});

test('rejected proposal status confirms no applied changes instead of promising future application', () => {
  const { proposal } = fixture();
  render(<DiscussionProposal proposal={proposal} rejected canSaveHere />);
  expect(screen.getByText('Предложение отклонено. Требования и ответ не изменены этим пакетом.')).toBeVisible();
  expect(screen.queryByText(/При принятии подтвердятся ответ/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Затем нажмите «Сохранить требования»/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Применить уточнение и закрыть вопрос' })).toBeDisabled();
});
