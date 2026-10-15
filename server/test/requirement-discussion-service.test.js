import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDiscussionContext, createRequirementDiscussionService as createService, validateDiscussionProposal, clarificationCoverageContract, validateClarificationCoverage, discussionRepairTargets } from '../src/services/requirement-discussion-service.js';

// Existing mocked semantic reviewers return the compact baseline certificate.
// Supply a mechanically valid coverage supplement; dedicated tests below check
// rejected supplements and the production requirement for complete coverage.
function createRequirementDiscussionService(options) {
  if (!options.generator) return createService(options);
  const generator = options.generator;
  return createService({ ...options, generator: async (args) => {
    const response = await generator(args);
    const supplement = args.messages.find((message) => message.content.startsWith('Обязательная проверка покрытия'));
    if (!supplement) return response;
    let raw; try { raw = JSON.parse(response.text); } catch { return response; }
    if (raw.schemaVersion !== 'babok-semantic.v2') return response;
    const contract = JSON.parse(supplement.content.split('(данные):\n')[1].split('\nДополнительно')[0]);
    const source = contract.finalRecords.find((record) => record.text);
    raw.conditionCoverage ??= contract.conditions.map(({ key }) => ({ key, status: 'covered', reason: 'Test fixture citation.', citations: [{ recordId: source.id, field: 'text', quote: source.text }] }));
    raw.rulePairs ??= contract.pairs.map(({ key }) => ({ key, sameRule: false, reason: 'Test fixture independent outcomes.' }));
    return { ...response, text: JSON.stringify(raw) };
  } });
}

const registry = {
  groups: {
    BR: [{ id: 'BR-001', text: 'Сократить время', successIndicator: null, relatedIds: [] }],
    SR: [{ id: 'SR-003', text: 'Владелец процесса', role: null, relatedTo: ['GAP-002'] }],
    FR: [{ id: 'FR-005', text: 'Показывать статус', relatedTo: [] }],
  },
  analysis: { GAP: [{ id: 'GAP-002', text: 'Не указан канал', affectedIds: ['FR-005', 'MISSING-001'], source: null }] },
};

test('discussion context includes reverse links, answers and unresolved references', () => {
  const value = buildDiscussionContext({
    content: registry,
    anchorId: 'GAP-002',
    baseVersionId: 'version-1',
    decisions: { review: { gaps: { 'GAP-002': { answer: 'Email', state: 'answered', reason: '' } } } },
  });
  assert.deepEqual(value.manifest.requirementIds, ['FR-005', 'MISSING-001', 'SR-003']);
  assert.equal(value.unsavedDraft, false);
  assert.equal(value.content.gaps[0].answer, 'Email');
  assert.ok(value.content.requirements.some((item) => item.id === 'MISSING-001' && item.missing));
});

test('requirement context includes directly linked requirements and GAP peers', () => {
  const content = structuredClone(registry);
  content.groups.BR[0].relatedIds = ['FR-005'];
  const value = buildDiscussionContext({ content, anchorId: 'SR-003', baseVersionId: 'version-1' });
  expectIds(value.manifest.requirementIds, ['SR-003', 'FR-005', 'MISSING-001']);
});

function expectIds(actual, expected) {
  assert.deepEqual(new Set(actual), new Set(expected));
}

test('proposal validation only permits existing requirement fields', () => {
  const context = buildDiscussionContext({ content: registry, anchorId: 'GAP-002', baseVersionId: 'version-1' });
  const proposal = validateDiscussionProposal({ explanation: 'Уточнить формулировку', changes: [{ targetId: 'FR-005', before: { text: 'Показывать статус' }, after: { text: 'Показывать текущий статус' }, rationale: 'Ответ владельца' }] }, { content: context });
  assert.equal(proposal.changes[0].targetType, 'FR');
  assert.equal(proposal.changes[0].before.text, 'Показывать статус');
  assert.throws(() => validateDiscussionProposal({ explanation: 'Нет', changes: [{ targetId: 'FR-005', after: { relatedTo: ['GAP-002'] } }] }, { content: context }), { code: 'DISCUSSION_PROPOSAL_INVALID' });
});

class MemoryDiscussionRepository {
  constructor() { this.discussions = new Map(); this.messages = new Map(); this.attempts = new Map(); this.proposals = new Map(); this.sequence = 0; }
  findByAnchor({ jobId, anchorId }) { return [...this.discussions.values()].find((item) => item.jobId === jobId && item.anchorId === anchorId) || null; }
  create({ tenantId, ownerUserId, jobId, anchorId, anchorType }) { const item = { discussionId: `d-${++this.sequence}`, tenantId, ownerUserId, jobId, anchorId, anchorType }; this.discussions.set(item.discussionId, item); this.messages.set(item.discussionId, []); return item; }
  get({ discussionId }) { return this.discussions.get(discussionId) || null; }
  listMessages({ discussionId }) { return { items: [...(this.messages.get(discussionId) || [])], nextCursor: null }; }
  findMessageByClientId({ discussionId, clientMessageId }) {
    const userMessage = (this.messages.get(discussionId) || []).find((item) => item.clientMessageId === clientMessageId);
    if (!userMessage) return null;
    const attempt = [...this.attempts.values()].find((item) => item.userMessageId === userMessage.messageId);
    return { userMessage, attempt };
  }
  beginTurn({ discussionId, clientMessageId, text, snapshot, generationId, model, promptVersion }) {
    const existing = this.findMessageByClientId({ discussionId, clientMessageId });
    if (existing) return { replayed: true, ...existing };
    const userMessage = { messageId: `m-${++this.sequence}`, discussionId, role: 'user', status: 'completed', text, clientMessageId };
    const assistantMessage = { messageId: `m-${++this.sequence}`, discussionId, role: 'assistant', status: 'pending', text: '' };
    const attempt = { attemptId: `a-${++this.sequence}`, discussionId, userMessageId: userMessage.messageId, assistantMessageId: assistantMessage.messageId, status: 'running', baseVersionId: snapshot.baseVersionId, generationId, model, promptVersion };
    this.messages.get(discussionId).push(userMessage, assistantMessage); this.attempts.set(attempt.attemptId, attempt);
    return { replayed: false, userMessage, assistantMessage, attempt };
  }
  beginRetry({ discussionId, userMessageId, snapshot, generationId, model, promptVersion }) {
    const userMessage = (this.messages.get(discussionId) || []).find((item) => item.messageId === userMessageId && item.role === 'user');
    if (!userMessage) return null;
    const assistantMessage = { messageId: `m-${++this.sequence}`, discussionId, role: 'assistant', status: 'pending', text: '' };
    const attempt = { attemptId: `a-${++this.sequence}`, discussionId, userMessageId, assistantMessageId: assistantMessage.messageId, status: 'running', baseVersionId: snapshot.baseVersionId, generationId, model, promptVersion };
    this.messages.get(discussionId).push(assistantMessage); this.attempts.set(attempt.attemptId, attempt);
    return { replayed: false, userMessage, assistantMessage, attempt };
  }
  async finishAttempt({ attemptId, assistantMessageId, status, text = '', errorCode = null }) { const attempt = this.attempts.get(attemptId); attempt.status = status; attempt.errorCode = errorCode; const message = this.messages.get(attempt.discussionId).find((item) => item.messageId === assistantMessageId); message.status = status; message.text = text; return { attempt, message }; }
  async cancelAttempt(args) { return this.finishAttempt({ ...args, status: 'cancelled', errorCode: 'DISCUSSION_CANCELLED' }); }
  findAttempt({ attemptId }) { return this.attempts.get(attemptId) || null; }
  storeProposal({ discussionId, messageId, proposal }) { const row = { id: `p-${++this.sequence}`, discussionId, messageId, package: proposal, status: 'available' }; this.proposals.set(row.id, row); return row; }
  latestAttempt({ discussionId }) { return [...this.attempts.values()].filter((item) => item.discussionId === discussionId).at(-1) || null; }
  latestProposal({ discussionId }) { const row = [...this.proposals.values()].filter((item) => item.discussionId === discussionId).at(-1); return row ? { proposalId: row.id, messageId: row.messageId, ...row.package, status: row.status } : null; }
}

const serviceAuth = { tenantId: 'tenant-a', userId: 'alice', roles: ['user'] };

test('discussion service scopes anchors and versions, replays idempotently, and retries without another user message', async () => {
  const repository = new MemoryDiscussionRepository();
  const version = { versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} };
  const versionService = { get: async () => version, list: async () => ({ items: [version] }) };
  const jobRepository = { findVisibleById: async ({ jobId }) => jobId === 'job-1' ? { id: jobId } : null };
  let calls = 0;
  let capturedMessages;
  const service = createRequirementDiscussionService({ repository, jobRepository, versionService, generator: async ({ messages }) => { capturedMessages = messages; calls += 1; return { text: JSON.stringify({ explanation: 'Уточнить', changes: [{ targetId: 'FR-005', before: { text: 'Показывать статус' }, after: { text: 'Показывать текущий статус' }, rationale: 'Ответ' }] }) }; } });
  await assert.rejects(() => service.open({ auth: serviceAuth, jobId: 'job-1', anchorId: 'FR-999', baseVersionId: 'v1' }), { code: 'DISCUSSION_ANCHOR_NOT_FOUND' });
  const opened = await service.open({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', baseVersionId: 'v1' });
  assert.equal(opened.messages.length, 0);
  const first = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Как уточнить?', clientMessageId: 'client-0001', baseVersionId: 'v1' } });
  assert.equal(first.proposal.changes[0].targetId, 'FR-005');
  const system = capturedMessages.filter((item) => item.role === 'system').map((item) => item.content).join('\n');
  for (const path of ['SKILL.md', 'references/classification.md', 'references/requirements-quality.md', 'references/output-template.md']) assert.ok(system.includes(`<skill-file path="${path}">`));
  assert.match(system, /Сохраняй действующих исполнителей/);
  assert.match(system, /TERM\/CTX\/HYP в интерфейсе доступны только для просмотра/);
  assert.match(system, /Не обещай автоматическое закрытие GAP/);
  assert.match(system, /changes: \[\]/);
  assert.equal(calls, 1);
  const replay = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Как уточнить?', clientMessageId: 'client-0001', baseVersionId: 'v1' } });
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  const attempt = first.attempt;
  await assert.rejects(() => service.retry({ auth: serviceAuth, jobId: 'job-1', attemptId: attempt.attemptId }), { code: 'DISCUSSION_RETRY_UNAVAILABLE' });
});

test('cancellation prevents a late provider response from becoming an applicable proposal', async () => {
  const repository = new MemoryDiscussionRepository();
  const versionService = { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }), list: async () => ({ items: [{ versionId: 'v1' }] }) };
  const jobRepository = { findVisibleById: async () => ({ id: 'job-1' }) };
  let release;
  const generator = () => new Promise((resolve) => { release = () => resolve({ text: JSON.stringify({ explanation: 'Опоздавший ответ', changes: [] }) }); });
  const service = createRequirementDiscussionService({ repository, jobRepository, versionService, generator });
  const pending = service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Проверка отмены', clientMessageId: 'client-0002', baseVersionId: 'v1' } });
  while (!repository.latestAttempt({ discussionId: 'd-1' })) await new Promise((resolve) => setTimeout(resolve, 0));
  const attempt = repository.latestAttempt({ discussionId: 'd-1' });
  const cancelled = await service.cancel({ auth: serviceAuth, jobId: 'job-1', attemptId: attempt.attemptId });
  assert.equal(cancelled.status, 'cancelled');
  const result = await pending;
  assert.equal(result.attempt.status, 'cancelled');
  assert.equal(result.proposal, undefined);
  release?.();
});


test('provider failure preserves its reason for actionable client errors', async () => {
  const service = createRequirementDiscussionService({
    repository: new MemoryDiscussionRepository(),
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async () => { throw Object.assign(new Error('Rejected'), { reasonCode: 'MODEL_HTTP_401' }); },
  });
  await assert.rejects(() => service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Что уточнить?', clientMessageId: 'client-auth-fail', baseVersionId: 'v1' } }), (error) => {
    assert.equal(error.code, 'DISCUSSION_GENERATION_FAILED');
    assert.equal(error.details.reasonCode, 'MODEL_HTTP_401');
    return true;
  });
});

test('a model reply that prefixes the JSON payload with prose still yields a proposal without leaking raw JSON', async () => {
  const repository = new MemoryDiscussionRepository();
  const service = createRequirementDiscussionService({
    repository,
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async () => ({
      text: 'Пакет готов. Обратите внимание: отдельного требования про веб-канал нет, это отражено в rationale.\n{"explanation":"Пакет уточнений по ответу владельца","changes":[{"targetId":"FR-005","before":{"text":"Показывать статус"},"after":{"text":"Показывать текущий статус"},"rationale":"Ответ владельца"}]}',
    }),
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Вот ответ', clientMessageId: 'client-preamble-1', baseVersionId: 'v1' } });
  assert.equal(turn.proposal.changes[0].targetId, 'FR-005');
  assert.equal(turn.proposal.explanation, 'Пакет уточнений по ответу владельца');
  const stored = turn.messages.find((item) => item.role === 'assistant');
  assert.ok(!stored.text.includes('"changes"'));
  assert.ok(stored.text.includes('Пакет уточнений'));
});

test('guided prompt persists no-change resolutions and a subsequent question never revives the old proposal', async () => {
  let call = 0;
  const captured = [];
  const content = structuredClone(registry);
  content.analysis.GAP[0].affectedIds = ['FR-005'];
  const service = createRequirementDiscussionService({
    repository: new MemoryDiscussionRepository(),
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry: content, decisions: {} }) },
    generator: async ({ messages }) => {
      captured.push(messages);
      return { text: JSON.stringify(++call === 1 ? { explanation: 'Уточнение', changes: [], clarification: { gapId: 'GAP-002', answer: 'Текущие требования подходят', remainingQuestions: [], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Уже отражено' }, { requirementId: 'SR-003', state: 'no-change', reason: 'Роль уже указана' }] } } : { explanation: 'Какой следующий шаг?', changes: [] }) };
    },
  });
  const first = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Согласовано', clientMessageId: 'guided-turn-001', baseVersionId: 'v1' } });
  assert.equal(first.proposal.clarification.canResolve, true);
  assert.equal(first.attempt.promptVersion, '3.9.0');
  assert.ok(captured[0].some((message) => message.content.includes('За один ход задавай только один')));
  assert.ok(captured[0].some((message) => message.content.includes('Не выдумывай')));
  await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Продолжим', clientMessageId: 'guided-turn-002', baseVersionId: 'v1' } });
  const reloaded = await service.get({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002' });
  assert.equal(reloaded.proposal, undefined);
  assert.equal(reloaded.messages.at(-1).text, 'Какой следующий шаг?');
});

test('malformed packages never expose raw JSON or salvage nested requirement fragments as a response', async () => {
  for (const text of [
    '{"explanation":"Вопрос автоматически закроется","changes":[{"targetId":"FR-005","before":{"text":"Показывать статус"},"after":{"text":"Новый статус"}],"rationale":"Ответ"}]}',
    'Пакет готов. {"explanation":"Вопрос автоматически закроется","changes":[{"before":{"text":"Показывать статус"}}',
    '{"changes":[INVALID],"clarification":{"answer":"Вопрос автоматически закроется"}}',
  ]) {
    const repository = new MemoryDiscussionRepository();
    let calls = 0;
    const service = createRequirementDiscussionService({ repository,
      jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
      versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
      generator: async () => { calls += 1; return { text }; },
    });
    const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Подготовь уточнение', clientMessageId: 'malformed-turn-001', baseVersionId: 'v1' } });
    assert.equal(turn.proposal, null);
    assert.equal(repository.proposals.size, 0);
    assert.equal(calls, 2);
    assert.match(turn.assistantMessage.text, /не прошли проверку/);
    assert.doesNotMatch(turn.assistantMessage.text, /"changes"|"before"|автоматически закроется/);
  }
});

test('one syntax repair can recover a full package but cannot bypass semantic validation', async () => {
  for (const targetId of ['FR-005', 'FR-999']) {
    let calls = 0;
    const repository = new MemoryDiscussionRepository();
    const service = createRequirementDiscussionService({ repository,
      jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
      versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
      generator: async ({ messages }) => {
        calls += 1;
        if (calls === 1) return { text: '{"explanation":"Уточнить","changes":[' };
        if (calls === 2) assert.match(messages[0].content, /Исправь только синтаксис/);
        else assert.match(messages.at(-1).content, /Пакет отклонён валидатором/);
        return { text: JSON.stringify({ explanation: 'Уточнить', changes: [{ targetId, before: { text: 'Показывать статус' }, after: { text: 'Показывать текущий статус' }, rationale: 'Ответ владельца' }] }) };
      },
    });
    const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Подготовь уточнение', clientMessageId: 'syntax-repair-001', baseVersionId: 'v1' } });
    assert.equal(calls, targetId === 'FR-005' ? 2 : 3);
    if (targetId === 'FR-005') assert.equal(turn.proposal.changes[0].targetId, targetId);
    else { assert.equal(turn.proposal, null); assert.equal(repository.proposals.size, 0); }
  }
});

test('plain prose remains readable without inventing a change package', async () => {
  const repository = new MemoryDiscussionRepository();
  const service = createRequirementDiscussionService({ repository,
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async () => ({ text: 'Какой канал получения статуса согласован?' }),
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Что уточнить?', clientMessageId: 'plain-turn-001', baseVersionId: 'v1' } });
  assert.equal(turn.assistantMessage.text, 'Какой канал получения статуса согласован?');
  assert.equal(turn.proposal, null);
});

test('a no-change accepted clarification receives a separate full-registry quality assessment and can update stale readiness', async () => {
  let calls = 0;
  const content = structuredClone(registry); content.analysis.GAP[0].affectedIds = ['FR-005'];
  const service = createRequirementDiscussionService({ repository: new MemoryDiscussionRepository(), config: { aiDiscussion: { qualityReassessment: true } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry: content, decisions: {} }) },
    generator: async ({ messages }) => {
      calls++;
      if (calls === 1) return { text: JSON.stringify({ explanation: 'Ответ уже отражён.', changes: [], clarification: { gapId: 'GAP-002', answer: 'Статус доступен.', remainingQuestions: [], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Уже отражено.' }, { requirementId: 'SR-003', state: 'no-change', reason: 'Потребность определена.' }] } }) };
      if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision: messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1], checks: Object.values(content.groups).flat().map((record) => ({ id: record.id, pass: true, issues: [] })) }) };
      assert.match(messages[0].content, /переоценку качества/);
      assert.match(messages[1].content, /BR-001/);
      return { text: JSON.stringify({ schemaVersion: 'babok-quality-assessment.v2', revision: messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1], assessments: [{ id: 'BR-001', quality: 'Требует уточнения', reason: 'Показатель не определён.', blockingGapIds: [], evidence: [{ recordId: 'BR-001', field: 'text', quote: content.groups.BR[0].text }] }, { id: 'SR-003', quality: 'Требует уточнения', reason: 'Конкретная роль отсутствует.', blockingGapIds: [], evidence: [{ recordId: 'SR-003', field: 'text', quote: content.groups.SR[0].text }] }, { id: 'FR-005', quality: 'Готово', reason: 'Наблюдаемый результат определён.', blockingGapIds: [], evidence: [{ recordId: 'FR-005', field: 'text', quote: content.groups.FR[0].text }] }] }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Проверь уже учтённый ответ.', clientMessageId: 'quality-no-change-001', baseVersionId: 'v1' } });
  assert.equal(calls, 3);
  assert.equal(turn.attempt.errorCode, null);
  assert.equal(turn.proposal.changes.length, 0);
  assert.equal(turn.proposal.qualityAssessment.assessments.length, 3);
  assert.equal(turn.proposal.qualityAssessment.assessments.find((item) => item.id === 'FR-005').quality, 'Готово');
});

test('independent review repairs a composite clarification and rechecks it, while persistent lost conditions cannot publish', async () => {
  for (const persistent of [false, true]) {
    let generations = 0, audits = 0;
    const repository = new MemoryDiscussionRepository();
    const service = createRequirementDiscussionService({ repository, config: { aiDiscussion: { semanticReview: true } },
      jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
      versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
      generator: async ({ messages }) => {
        const auditPrompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
        if (auditPrompt) {
          audits++;
          const revision = auditPrompt.match(/"revision":"([a-f0-9]{16})"/)[1];
          return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision, checks: [{ key: 'FR-005', classification: 'FR', atomic: audits !== 1, obligations: audits === 1 ? ['Показать статус', 'Отправить уведомление'] : ['Показать статус'], evidence: 'SUPPORTED', verifiable: true, preservesOriginal: !persistent, distinctOutcome: true, issues: [], reason: 'Проверены исходные условия', repair: 'Разделить независимые результаты' }], coverageIssues: [] }) };
        }
        generations++;
        if (generations === 2) assert.match(messages.at(-1).content, /Независимая BABOK-проверка/);
        return { text: JSON.stringify({ explanation: 'Уточнение', changes: [{ targetId: 'FR-005', after: { text: generations === 1 ? 'Показывать статус и отправлять уведомление' : 'Показывать текущий статус' } }] }) };
      },
    });
    const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Уточнить статус', clientMessageId: 'independent-clarification-001', baseVersionId: 'v1' } });
    assert.equal(generations, 2);
    assert.equal(audits, 2);
    if (persistent) {
      assert.equal(turn.proposal, null);
      assert.equal(repository.proposals.size, 0);
      assert.equal(turn.attempt.errorCode, 'DISCUSSION_PROPOSAL_SEMANTIC_INVALID');
    } else {
      assert.equal(turn.proposal.semanticValidation.status, 'PASSED');
      assert.equal(turn.proposal.changes[0].after.text, 'Показывать текущий статус');
    }
  }
});

test('syntax repair does not consume clarification contract repair and dispositions still match changes', async () => {
  let calls = 0;
  const repository = new MemoryDiscussionRepository();
  const service = createRequirementDiscussionService({ repository,
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async ({ messages }) => {
      if (++calls === 1) return { text: '{"explanation":"Уточнение","changes":[' };
      if (calls === 3) assert.match(messages.at(-1).content, /Для каждого ID из changes/);
      return { text: JSON.stringify({ explanation: 'Уточнение', changes: [{ targetId: 'FR-005', before: { text: 'Показывать статус' }, after: { text: 'Показывать текущий статус' } }], clarification: { gapId: 'GAP-002', answer: 'Показывать текущий статус', remainingQuestions: ['Уточнить отсутствующую связь'], checks: [{ requirementId: 'FR-005', state: calls === 2 ? 'no-change' : 'incorporated', reason: 'Формулировка уточняется по ответу' }] } }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Показывать текущий статус', clientMessageId: 'two-contract-budgets-001', baseVersionId: 'v1' } });
  assert.equal(calls, 3);
  assert.equal(turn.attempt.errorCode, null);
  assert.equal(turn.proposal.clarification.checks[0].state, 'incorporated');
  assert.equal(turn.proposal.clarification.canResolve, false);
  assert.equal(repository.proposals.size, 1);
});

test('an inconsistent critic certificate repairs the critic without rewriting a valid bounded operation', async () => {
  let generations = 0, audits = 0;
  const repository = new MemoryDiscussionRepository();
  const service = createRequirementDiscussionService({ repository, config: { aiDiscussion: { semanticReview: true } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async ({ messages }) => {
      const prompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
      if (!prompt) { generations++; return { text: JSON.stringify({ explanation: 'Уточнение', changes: [{ targetId: 'FR-005', after: { text: 'Показывать текущий статус' } }] }) }; }
      audits++;
      const revision = prompt.match(/"revision":"([a-f0-9]{16})"/)[1];
      return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision, checks: [{ key: 'FR-005', classification: 'FR', atomic: true, obligations: audits === 1 ? ['Показать статус', 'Формат результата'] : ['Показать текущий статус'], evidence: 'SUPPORTED', verifiable: true, preservesOriginal: true, distinctOutcome: true, issues: [], reason: 'Одно действие', repair: '' }], coverageIssues: [] }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Уточнить статус', clientMessageId: 'critic-consistency-001', baseVersionId: 'v1' } });
  assert.equal(generations, 1);
  assert.equal(audits, 2);
  assert.equal(turn.proposal.semanticValidation.status, 'PASSED');
  assert.deepEqual(turn.proposal.semanticValidation.corrections, []);
});

test('a semantic correction with forbidden fields receives bounded contract repair and another independent audit', async () => {
  let generations = 0, audits = 0;
  const service = createRequirementDiscussionService({ repository: new MemoryDiscussionRepository(), config: { aiDiscussion: { semanticReview: true } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async ({ messages }) => {
      const prompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
      if (prompt) {
        audits++;
        return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision: prompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: [{ key: 'FR-005', classification: 'FR', atomic: audits !== 1, obligations: audits === 1 ? ['Показать статус', 'Отправить уведомление'] : ['Показать текущий статус'], evidence: 'SUPPORTED', verifiable: true, preservesOriginal: true, distinctOutcome: true, issues: [], reason: '', repair: '' }], coverageIssues: [] }) };
      }
      generations++;
      if (generations === 3) assert.match(messages.at(-1).content, /Исправь контракт автоматически исправленного пакета/);
      return { text: JSON.stringify({ explanation: 'Уточнение', changes: [{ targetId: 'FR-005', after: { text: generations === 1 ? 'Показывать статус и отправлять уведомление' : 'Показывать текущий статус', ...(generations === 2 ? { quality: 'Готово' } : {}) } }] }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Уточнить статус', clientMessageId: 'late-contract-repair-001', baseVersionId: 'v1' } });
  assert.equal(generations, 3);
  assert.equal(audits, 2);
  assert.deepEqual(turn.proposal.changes[0].after, { text: 'Показывать текущий статус' });
  assert.equal(turn.proposal.semanticValidation.status, 'PASSED');
});

test('malformed critic check collections are repaired as certificates without rewriting requirements', async () => {
  for (const malformed of [{}, [null]]) {
    let generations = 0, audits = 0;
    const service = createRequirementDiscussionService({ repository: new MemoryDiscussionRepository(), config: { aiDiscussion: { semanticReview: true } },
      jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
      versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
      generator: async ({ messages }) => {
        const prompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
        if (!prompt) { generations++; return { text: JSON.stringify({ explanation: 'Уточнение', changes: [{ targetId: 'FR-005', after: { text: 'Показывать текущий статус' } }] }) }; }
        audits++;
        return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision: prompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: audits === 1 ? malformed : [{ key: 'FR-005', classification: 'FR', atomic: true, obligations: ['Показывать текущий статус'], evidence: 'SUPPORTED', verifiable: true, preservesOriginal: true, distinctOutcome: true, issues: [], reason: '', repair: '' }], coverageIssues: [] }) };
      },
    });
    const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Уточнить статус', clientMessageId: 'critic-shape-repair-001', baseVersionId: 'v1' } });
    assert.equal(generations, 1);
    assert.equal(audits, 2);
    assert.equal(turn.proposal.semanticValidation.status, 'PASSED');
  }
});

test('rejected proposals preserve their error code and explain the failed check without claiming an applicable edit', async () => {
  const cases = [
    { change: { targetId: 'FR-999', after: { text: 'Новый статус' } }, reason: /нет среди доступных требований/ },
    { change: { targetId: 'FR-005', after: { quality: 'Готово' } }, reason: /поле, которое нельзя редактировать/ },
    { change: { targetId: 'FR-005', before: { text: 'Другая редакция' }, after: { text: 'Новый статус' } }, reason: /не совпадают с текущими требованиями/ },
    { change: { targetId: 'FR-005', after: { text: 'Новый статус' } }, clarification: { gapId: 'GAP-002', answer: 'Push', remainingQuestions: ['Срок?'], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Правка не нужна' }] }, reason: /не совпадают с предложенными правками/ },
  ];
  for (const { change, clarification, reason } of cases) {
    const repository = new MemoryDiscussionRepository();
    const service = createRequirementDiscussionService({ repository,
      jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
      versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
      generator: async () => ({ text: JSON.stringify({ explanation: 'Правка готова, вопрос закроется', changes: [change], ...(clarification ? { clarification } : {}) }) }),
    });
    const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Подготовь уточнение', clientMessageId: 'diagnostic-turn-001', baseVersionId: 'v1' } });
    assert.equal(turn.proposal, null);
    assert.equal(repository.proposals.size, 0);
    assert.equal(turn.attempt.errorCode, change.before ? 'DISCUSSION_PROPOSAL_STALE' : 'DISCUSSION_PROPOSAL_INVALID');
    assert.match(turn.assistantMessage.text, reason);
    assert.match(turn.assistantMessage.text, /Изменения не применены/);
    assert.doesNotMatch(turn.assistantMessage.text, /Правка готова|вопрос закроется|"changes"/);
    const reloaded = await service.get({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002' });
    assert.match(reloaded.messages.at(-1).text, reason);
    assert.equal(reloaded.attempt.errorCode, turn.attempt.errorCode);
  }
});

test('cancelling during syntax repair prevents its late result from becoming a proposal', async () => {
  const repository = new MemoryDiscussionRepository();
  let calls = 0;
  let release;
  const service = createRequirementDiscussionService({ repository,
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async () => {
      if (++calls === 1) return { text: '{"explanation":"Уточнить","changes":[' };
      return new Promise((resolve) => { release = () => resolve({ text: JSON.stringify({ explanation: 'Уточнить', changes: [{ targetId: 'FR-005', after: { text: 'Текущий статус' } }] }) }); });
    },
  });
  const pending = service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Подготовь уточнение', clientMessageId: 'cancel-repair-001', baseVersionId: 'v1' } });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  await service.cancel({ auth: serviceAuth, jobId: 'job-1', attemptId: repository.latestAttempt({ discussionId: 'd-1' }).attemptId });
  release();
  const turn = await pending;
  assert.equal(turn.attempt.status, 'cancelled');
  assert.equal(repository.proposals.size, 0);
});

test('GAP context preserves parent roles and scope constraints as read-only evidence', () => {
  const content = structuredClone(registry);
  content.groups.FR[0].relatedTo = ['SR-PARENT'];
  content.groups.SR.push({ id: 'SR-PARENT', text: 'Работает только оператор', role: 'Оператор', relatedTo: [] });
  content.groups.CON = [{ id: 'CON-001', text: 'Только интерфейс оператора' }];
  const value = buildDiscussionContext({ content, anchorId: 'GAP-002' });
  assert.ok(value.content.contextRecords.some((record) => record.id === 'SR-PARENT' && record.role === 'Оператор'));
  assert.ok(value.content.contextRecords.some((record) => record.id === 'CON-001'));
  assert.ok(!value.manifest.requirementIds.includes('SR-PARENT'));
  assert.throws(() => validateDiscussionProposal({ explanation: 'Уточнение', changes: [{ targetId: 'SR-PARENT', after: { role: 'Сотрудник' } }] }, { content: value }), { code: 'DISCUSSION_PROPOSAL_INVALID' });
});

test('one semantic repair fixes duplicate guided checks using the original context', async () => {
  const repository = new MemoryDiscussionRepository();
  let calls = 0;
  const valid = { explanation: 'Предлагаю учесть ответ', changes: [], clarification: { gapId: 'GAP-002', answer: 'Показываем текущий статус', remainingQuestions: ['Какой канал согласован?'], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Показ статуса уже предусмотрен' }] } };
  const service = createRequirementDiscussionService({ repository,
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry, decisions: {} }) },
    generator: async ({ messages, context }) => {
      calls += 1;
      if (calls === 1) return { text: JSON.stringify({ ...valid, clarification: { ...valid.clarification, checks: [...valid.clarification.checks, ...valid.clarification.checks] } }) };
      assert.match(messages.at(-1).content, /Unknown or duplicate/);
      assert.equal(context.content.selected.id, 'GAP-002');
      assert.ok(messages.some((item) => item.role === 'user' && item.content === 'Учти мой ответ'));
      return { text: JSON.stringify(valid) };
    },
  });
  const result = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Учти мой ответ', clientMessageId: 'semantic-fix-001', baseVersionId: 'v1' } });
  assert.equal(calls, 2);
  assert.equal(result.proposal.clarification.checks.length, 1);
  assert.equal(result.proposal.clarification.canResolve, false);
});

test('nullable before values match the snapshot without weakening stale or missing-field protection', () => {
  const context = buildDiscussionContext({ content: registry, anchorId: 'BR-001', baseVersionId: 'v1' });
  const proposal = (before) => ({ explanation: 'Показатель согласован', changes: [{ targetId: 'BR-001', before, after: { successIndicator: '1000 новых клиентов за 6 месяцев' } }] });
  for (const empty of [null, '']) {
    const result = validateDiscussionProposal(proposal({ successIndicator: empty }), { content: context });
    assert.equal(result.changes[0].before.successIndicator, '');
  }
  for (const before of [{}, { successIndicator: 'Устаревший показатель' }]) assert.throws(() => validateDiscussionProposal(proposal(before), { content: context }), { code: 'DISCUSSION_PROPOSAL_STALE' });
});

test('AI clarification cannot replace a business outcome with a measurement definition', () => {
  const context = buildDiscussionContext({ content: registry, anchorId: 'BR-001', baseVersionId: 'v1' });
  assert.throws(() => validateDiscussionProposal({ explanation: 'Предлагаю показатель', changes: [{ targetId: 'BR-001', after: { text: 'Достижение бизнес-цели измеряется долей новых клиентов.' } }] }, { content: context }), { code: 'DISCUSSION_PROPOSAL_SEMANTIC_INVALID' });
  const valid = validateDiscussionProposal({ explanation: 'Уточняю показатель', changes: [{ targetId: 'BR-001', after: { successIndicator: 'Доля новых клиентов за согласованный период.' } }] }, { content: context });
  assert.deepEqual(Object.keys(valid.changes[0].after), ['successIndicator']);
});

test('clarification cannot replace a protection outcome by only a check, while an explicit protective decision remains valid', () => {
  const content = structuredClone(registry);
  content.groups.FR[0].text = 'Решение исключает повторную выплату при повторной отправке строки.';
  const snapshot = buildDiscussionContext({ content, anchorId: 'FR-005', baseVersionId: 'v1', decisions: {} });
  const proposal = (text) => ({ explanation: 'По решению владельца', changes: [{ targetId: 'FR-005', after: { text } }] });
  assert.throws(() => validateDiscussionProposal(proposal('При повторном исполнении решение сверяет идентификатор со статусом платежа.'), { content: snapshot }), { code: 'DISCUSSION_PROPOSAL_SEMANTIC_INVALID' });
  assert.equal(validateDiscussionProposal(proposal('При повторной отправке решение сверяет идентификатор со статусом платежа: проведённая выплата не исполняется повторно; при неопределённом статусе новая выплата не запускается до окончательного результата.'), { content: snapshot }).changes.length, 1);
});

test('discussion explanations and clarification checks cannot cite an invented requirement', () => {
  const context = buildDiscussionContext({ content: registry, anchorId: 'FR-005', baseVersionId: 'v1' });
  assert.throws(() => validateDiscussionProposal({ explanation: 'Это покрыто FR-999.', changes: [] }, { content: context }), { code: 'DISCUSSION_PROPOSAL_INVALID' });
  const guided = buildDiscussionContext({ content: registry, anchorId: 'GAP-002', baseVersionId: 'v1' });
  assert.throws(() => validateDiscussionProposal({ explanation: 'Ответ учтён.', changes: [], clarification: { gapId: 'GAP-002', answer: 'Статус отображается.', remainingQuestions: [], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Покрыто FR-999.' }, { requirementId: 'SR-003', state: 'no-change', reason: 'Потребность известна.' }] } }, { content: guided }), { code: 'DISCUSSION_PROPOSAL_INVALID' });
});

test('inline additions reserve historical IDs and require semantic and full quality review even with feature flags off', async () => {
  const full = structuredClone(registry);
  full.materials = { primary: { artifactId: 'primary' } };
  full.analysis.GAP[0].affectedIds = ['SR-003'];
  const historical = structuredClone(full); historical.groups.SR.push({ id: 'SR-012', text: 'Удалённое требование', role: 'Клиент', relatedTo: [] });
  const version = { versionId: 'v1', sourceJobId: 'job-1', registry: full, decisions: {} };
  const repository = new MemoryDiscussionRepository();
  let semantic = 0, quality = 0, qualityReview = 0;
  let assessed;
  const service = createRequirementDiscussionService({ repository, config: { aiDiscussion: { semanticReview: false, qualityReassessment: false } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => version, list: async () => ({ items: [version, { ...version, versionId: 'older', registry: historical }] }) },
    generator: async ({ messages }) => {
      const auditPrompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
      if (auditPrompt) {
        semantic++;
        const candidates = JSON.parse(auditPrompt.split('Кандидаты (данные):\n')[1].split('\nВерни')[0]);
        assert.equal(candidates.length, 1); assert.equal(candidates[0].key, 'SR-015'); assert.equal(candidates[0].original, undefined);
        return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision: auditPrompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: candidates.map(({ key, type }) => ({ key, classification: type, obligations: ['Возобновить сервис'], atomic: true, evidence: 'SUPPORTED', verifiable: true, preservesOriginal: true, distinctOutcome: true, issues: [], reason: 'Подтверждено пользователем.', repair: '' })), coverageIssues: [] }) };
      }
      if (messages[0].content.includes('Независимая проверка оснований качества')) {
        qualityReview++;
        return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision: messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1], checks: assessed.map(({ id }) => ({ id, pass: true, issues: [] })) }) };
      }
      if (messages[0].content.includes('независимую переоценку качества')) {
        quality++;
        const context = JSON.parse(messages[1].content.split('(данные):\n')[1].split('\nВерни')[0]);
        assert.ok(context.records.some((record) => record.id === 'SR-015'));
        assessed = context.records.map((record) => ({ id: record.id, quality: 'Требует уточнения', reason: 'Нужна проверка формулировки.', blockingGapIds: [], evidence: [{ recordId: record.id, field: 'text', quote: record.text }] }));
        return { text: JSON.stringify({ schemaVersion: 'babok-quality-assessment.v2', revision: messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1], assessments: assessed }) };
      }
      return { text: JSON.stringify({ explanation: 'Предлагаю отдельное требование возобновления.', changes: [], additions: [{ type: 'SR', fields: { text: 'Клиенту нужна возможность возобновить сервис.', role: 'Клиент' }, rationale: 'Клиент подтвердил самостоятельное возобновление.' }], clarification: { gapId: 'GAP-002', answer: 'Клиент сам возобновляет сервис.', remainingQuestions: [], checks: [{ requirementId: 'SR-003', state: 'no-change', reason: 'Исходная потребность сохранена.' }] } }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Клиент сам возобновляет сервис.', clientMessageId: 'inline-addition-001', baseVersionId: 'v1', draft: { registry: full, reservedIds: ['SR-014'] } } });
  assert.equal(turn.attempt.errorCode, null);
  assert.equal(turn.proposal.additions[0].record.id, 'SR-015');
  assert.equal(turn.proposal.clarification.canResolve, true);
  assert.equal(turn.proposal.semanticValidation.status, 'PASSED');
  assert.equal(turn.proposal.qualityAssessment.assessments.length, 4);
  assert.equal(repository.proposals.size, 1);
  assert.deepEqual([semantic, quality, qualityReview], [1, 1, 1]);
  assert.equal(full.groups.SR.length, 1);
});

test('prior answers inform other GAPs without widening mutable targets and bind their state for stale checks', () => {
  const full = structuredClone(registry);
  full.analysis.GAP.push(...['003', '004', '005', '006'].map((number) => ({ id: `GAP-${number}`, text: `Предыдущий вопрос ${number}`, affectedIds: ['BR-001'] })));
  const decisions = { review: { gaps: {
    'GAP-003': { answer: 'Возвраты не отменяют накопления.', state: 'closed' },
    'GAP-004': { answer: 'Прежний ответ', state: 'answered', stale: true },
    'GAP-005': { answer: '', state: 'closed' },
    'GAP-006': { answer: 'Требует пересмотра', state: 'open' },
  } } };
  const context = buildDiscussionContext({ content: full, anchorId: 'GAP-002', decisions });
  assert.deepEqual(context.content.priorAnswers, [{ id: 'GAP-003', text: 'Предыдущий вопрос 003', answer: 'Возвраты не отменяют накопления.', state: 'closed' }]);
  assert.deepEqual(context.manifest.priorAnswerIds, ['GAP-003']);
  assert.equal(context.manifest.requirementIds.includes('BR-001'), false);
  const proposal = validateDiscussionProposal({ explanation: 'Уточняем текущий статус', changes: [{ targetId: 'FR-005', after: { text: 'Показывать текущий статус' } }] }, { content: context });
  assert.deepEqual(proposal.gapBases['GAP-003'], { question: 'Предыдущий вопрос 003', answer: 'Возвраты не отменяют накопления.', state: 'closed', stale: false });
  assert.throws(() => validateDiscussionProposal({ explanation: 'Изменить прошлое', changes: [{ targetId: 'BR-001', after: { text: 'Другая цель' } }] }, { content: context }), { code: 'DISCUSSION_PROPOSAL_INVALID' });
  const compact = buildDiscussionContext({ content: full, anchorId: 'GAP-002', decisions, maxBytes: Buffer.byteLength(JSON.stringify({ ...context.content, registryOverview: [], priorAnswers: [] }), 'utf8') });
  assert.deepEqual(compact.content.priorAnswers, []);
  assert.ok(compact.omitted.includes('GAP-003:priorAnswer'));
  assert.deepEqual(compact.manifest.requirementIds, context.manifest.requirementIds);
});

test('joint critic repairs separately atomic fragments into one complete idempotency rule', async () => {
  const base = { id: 'FR-021', text: 'Решение не повторяет перевод округления для одной исходной операции.', relatedTo: ['GAP-020'] };
  const full = { materials: { primary: { artifactId: 'primary' } }, groups: { FR: [base] }, analysis: { GAP: [{ id: 'GAP-020', text: 'Как исключить повторный перевод?', affectedIds: [base.id] }] } };
  const fragments = ['Решение определяет операцию по ключу исходной покупки.', 'Решение ожидает подтверждения при неизвестном результате перевода.', 'Решение сериализует конкурентную обработку одной покупки.', 'Решение не повторяет окончательно пропущенный перевод.'];
  const merged = 'Решение допускает не более одного перевода округления по ключу исходной покупки: при успешном или окончательно пропущенном результате не повторяет перевод; при неизвестном результате ожидает подтверждения; конкурентная и повторная доставка не создают дополнительный перевод.';
  let generations = 0, audits = 0;
  const service = createRequirementDiscussionService({ repository: new MemoryDiscussionRepository(), config: { aiDiscussion: { semanticReview: true } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry: full, decisions: {} }) },
    generator: async ({ messages }) => {
      const prompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
      if (prompt) {
        audits++;
        assert.match(prompt, /Оцени кандидатов вместе/);
        assert.match(prompt, /Отдельная тестируемость ветви не доказывает независимость результата/);
        const candidates = JSON.parse(prompt.split('Кандидаты (данные):\n')[1].split('\nВерни')[0]);
        assert.equal(candidates.length, audits === 1 ? 5 : 1);
        if (audits === 2) assert.equal(candidates[0].record.text, merged);
        return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision: prompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: candidates.map(({ key }) => ({ key, classification: 'FR', obligations: ['Обработать операцию однократно'], atomic: true, evidence: 'SUPPORTED', verifiable: true, preservesOriginal: true, distinctOutcome: true, issues: [], reason: 'Условие подтверждено.', repair: '' })), coverageIssues: audits === 1 ? ['Искусственное дробление одного инварианта: ключ, статусы и конкуренция являются ветвями однократной обработки.'] : [] }) };
      }
      generations++;
      if (generations === 2) assert.match(messages.at(-1).content, /без потери ключа, статусов, конкуренции и запрета повторного эффекта/);
      return { text: JSON.stringify({ explanation: 'Уточняется правило однократного перевода.', changes: [{ targetId: base.id, after: { text: generations === 1 ? 'Решение не повторяет успешно выполненный перевод округления.' : merged }, rationale: 'Ответ владельца.' }], ...(generations === 1 ? { additions: fragments.map((text) => ({ type: 'FR', fields: { text }, rationale: 'Уточнённое условие обработки.' })) } : {}), clarification: { gapId: 'GAP-020', answer: 'Все перечисленные условия подтверждены.', remainingQuestions: [], checks: [{ requirementId: base.id, state: 'incorporated', reason: 'Уточнено правило.' }] } }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-020', body: { message: 'Подтверждаю ключ покупки, ожидание неизвестного результата, запрет повтора успешного и окончательно пропущенного результата и защиту при конкурентной доставке.', clientMessageId: 'joint-invariant-001', baseVersionId: 'v1' } });
  assert.equal(turn.attempt.errorCode, null);
  assert.equal(turn.proposal.changes[0].after.text, merged);
  assert.equal(turn.proposal.additions, undefined);
  assert.equal(turn.proposal.semanticValidation.corrections.length, 1);
  assert.deepEqual([generations, audits], [2, 2]);
});

test('critic repairs missing answer constraints and merges an accounting exception without expanding editable targets', async () => {
  const full = { materials: { primary: { artifactId: 'primary' } }, groups: { FR: [
    { id: 'FR-031', text: 'Решение рассчитывает разницу округления.', relatedTo: ['SR-010'] },
    { id: 'FR-032', text: 'Решение позволяет клиенту выбрать месячный лимит.', relatedTo: ['SR-010'] },
  ], SR: [{ id: 'SR-010', text: 'Клиенту нужно настроить округление.', role: 'Клиент', relatedTo: [] }] }, analysis: { GAP: [{ id: 'GAP-030', text: 'Как рассчитывать округление?', affectedIds: ['FR-031'] }] } };
  const answer = 'Разница рассчитывается в копейках. Месячный лимит — выбранная клиентом положительная сумма в рублях. Учитываются успешные переводы за календарный месяц по Москве; сброс первого числа. Возвраты не уменьшают использованный лимит. При превышении остатка перевод пропускается целиком без частичного перевода и повтора.';
  const completeLimit = 'Решение применяет выбранный клиентом положительный месячный лимит в рублях: при превышении остатка лимита перевод пропускается целиком без частичного перевода и повтора.';
  const completeAccounting = 'Решение учитывает только успешные переводы за календарный месяц по Москве, сбрасывает использованную сумму первого числа нового месяца и не уменьшает её при возвратах покупок.';
  let generations = 0, audits = 0;
  let assessments;
  const service = createRequirementDiscussionService({ repository: new MemoryDiscussionRepository(), config: { aiDiscussion: { semanticReview: true } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) },
    versionService: { get: async () => ({ versionId: 'v1', sourceJobId: 'job-1', registry: full, decisions: { review: { gaps: { 'GAP-030': { state: 'answered', answer } } } } }) },
    generator: async ({ messages }) => {
      const auditPrompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
      if (auditPrompt) {
        audits++;
        assert.match(auditPrompt, /Простое повторение условия в clarification.answer или explanation не доказывает покрытия/);
        assert.match(auditPrompt, /Исключение из расчёта\/учёта является ветвью того же правила/);
        const candidates = JSON.parse(auditPrompt.split('Кандидаты (данные):\n')[1].split('\nВерни')[0]);
        const context = JSON.parse(auditPrompt.split('(данные):\n')[1].split('\nКандидаты')[0]);
        assert.equal(context.snapshot.content.registryOverview.find((record) => record.id === 'FR-032').text, full.groups.FR[1].text);
        assert.deepEqual(context.snapshot.manifest.requirementIds, ['FR-031']);
        assert.equal(candidates.length, audits === 1 ? 4 : 3);
        if (audits === 2) {
          assert.equal(candidates[1].record.text, completeLimit);
          assert.equal(candidates[2].record.text, completeAccounting);
        }
        return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision: auditPrompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: candidates.map(({ key, type }) => ({ key, classification: type, obligations: ['Применить подтверждённое правило'], atomic: true, evidence: 'SUPPORTED', verifiable: true, preservesOriginal: true, distinctOutcome: true, issues: [], reason: 'Подтверждено.', repair: '' })), coverageIssues: audits === 1 ? ['Потеряны положительное значение и рубли месячного лимита. Возвраты искусственно выделены из правила учёта. Нельзя спрашивать о наличии показанного выбора лимита.'] : [] }) };
      }
      if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision: messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1], checks: assessments.map(({ id }) => ({ id, pass: true, issues: [] })) }) };
      if (messages[0].content.includes('независимую переоценку качества')) {
        const context = JSON.parse(messages[1].content.split('(данные):\n')[1].split('\nВерни')[0]);
        assessments = context.records.map((record) => ({ id: record.id, quality: 'Требует уточнения', reason: 'Нужна проверка формулировки.', blockingGapIds: [], evidence: [{ recordId: record.id, field: 'text', quote: record.text }] }));
        return { text: JSON.stringify({ schemaVersion: 'babok-quality-assessment.v2', revision: messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1], assessments }) };
      }
      generations++;
      const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
      assert.match(system, /каждое существенное условие/);
      assert.match(system, /registryOverview не расширяет changes\/checks/);
      if (generations === 2) assert.match(messages.at(-1).content, /повтор условия только в answer не исправляет coverageIssues/);
      const additions = (generations === 1 ? ['Решение пропускает перевод при превышении остатка лимита.', 'Решение учитывает успешные переводы в месяце по Москве со сбросом первого числа.', 'Решение не уменьшает использованный лимит при возвратах.'] : [completeLimit, completeAccounting]).map((text) => ({ type: 'FR', fields: { text }, rationale: 'Подтверждённое правило.' }));
      return { text: JSON.stringify({ explanation: generations === 1 ? 'Если выбора лимита нет, сообщите.' : 'Выбор лимита уже есть; дополнены правила применения и учёта.', changes: [{ targetId: 'FR-031', after: { text: 'Решение рассчитывает разницу округления в целых копейках.' }, rationale: 'Уточнена единица расчёта.' }], additions, clarification: { gapId: 'GAP-030', answer, remainingQuestions: [], checks: [{ requirementId: 'FR-031', state: 'incorporated', reason: 'Уточнён расчёт.' }] } }) };
    },
  });
  const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-030', body: { message: 'Подготовь пакет по сохранённому ответу.', clientMessageId: 'answer-coverage-001', baseVersionId: 'v1' } });
  assert.equal(turn.attempt.errorCode, null);
  assert.equal(turn.proposal.clarification.canResolve, true);
  assert.equal(turn.proposal.additions.length, 2);
  assert.equal(turn.proposal.additions[0].record.text, completeLimit);
  assert.equal(turn.proposal.additions[1].record.text, completeAccounting);
  assert.deepEqual(turn.proposal.changes.map((change) => change.targetId), ['FR-031']);
  assert.deepEqual([generations, audits], [2, 2]);
});

test('structured coverage requires every condition, real final citations and explicit pairwise rule review', () => {
  const full = { groups: { FR: [{ id: 'FR-101', text: 'Учитывать проведённые покупки. Лимит — положительная сумма в рублях.' }] } };
  const records = [
    { key: 'FR-102', type: 'FR', record: { id: 'FR-102', text: 'Учитывать успешные переводы в месячном лимите.' } },
    { key: 'FR-103', type: 'FR', record: { id: 'FR-103', text: 'Возвраты не уменьшают использованный лимит.' } },
  ];
  const contract = clarificationCoverageContract({ content: { gaps: [{ id: 'GAP-100', answer: 'Лимит положительный; лимит в рублях.' }], priorAnswers: [{ id: 'GAP-099', answer: 'Учитывать только проведённые покупки.' }] } }, records, full);
  assert.equal(contract.conditions.length, 3);
  assert.equal(contract.pairs.length, 1);
  const certificate = () => ({ conditionCoverage: contract.conditions.map(({ key }) => ({ key, status: 'covered', reason: 'Проверено по итоговому тексту.', citations: [{ recordId: 'FR-101', field: 'text', quote: full.groups.FR[0].text }] })), rulePairs: [{ key: 'FR-102|FR-103', sameRule: false, reason: 'Два самостоятельных результата.' }] });
  assert.doesNotThrow(() => validateClarificationCoverage(certificate(), contract));
  for (const mutate of [
    (value) => value.conditionCoverage.pop(),
    (value) => { value.conditionCoverage[0].key = 'invented'; },
    (value) => { value.conditionCoverage[0].citations[0].quote = 'положительный лимит в рублях'; },
    (value) => { value.conditionCoverage[0].citations[0].recordId = 'FR-999'; },
    (value) => { value.conditionCoverage[0].status = 'not-applicable'; },
    (value) => { value.conditionCoverage[0].status = 'remaining'; value.conditionCoverage[0].remainingQuestion = 'Неучтённый лимит'; },
    (value) => { value.rulePairs = []; },
    (value) => { value.rulePairs[0].sameRule = true; value.rulePairs[0].reason = 'Исключение из обновления того же счётчика.'; },
  ]) { const value = certificate(); mutate(value); assert.throws(() => validateClarificationCoverage(value, contract)); }
  const missing = certificate(); missing.conditionCoverage[0] = { key: contract.conditions[0].key, status: 'remaining', reason: 'Нет ограничения.', remainingQuestion: 'Нужно учесть положительное значение.' };
  assert.doesNotThrow(() => validateClarificationCoverage(missing, contract, ['Нужно учесть положительное значение.']));
});

test('production no-change clarification cannot publish an old critic certificate without structured coverage', async () => {
  const version = { versionId: 'v1', sourceJobId: 'job-1', registry, decisions: { review: { gaps: { 'GAP-002': { state: 'answered', answer: 'Использовать текущий статус.' } } } } };
  let audits = 0;
  const service = createService({ repository: new MemoryDiscussionRepository(), config: { aiDiscussion: { semanticReview: true } },
    jobRepository: { findVisibleById: async () => ({ id: 'job-1' }) }, versionService: { get: async () => version },
    generator: async ({ messages }) => {
      const prompt = messages.find((message) => message.content.includes('Кандидаты (данные):'))?.content;
      if (prompt) { audits++; return { text: JSON.stringify({ schemaVersion: 'babok-semantic.v2', revision: prompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: [], coverageIssues: [] }) }; }
      return { text: JSON.stringify({ explanation: 'Без правок.', changes: [], clarification: { gapId: 'GAP-002', answer: 'Использовать текущий статус.', remainingQuestions: ['Отсутствует связь.'], checks: [{ requirementId: 'FR-005', state: 'no-change', reason: 'Уже определено.' }] } }) };
    },
  });
  const result = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Проверь сохранённый ответ.', clientMessageId: 'coverage-required-001', baseVersionId: 'v1' } });
  assert.equal(result.proposal, null);
  assert.equal(result.attempt.errorCode, 'DISCUSSION_PROPOSAL_SEMANTIC_INVALID');
  assert.equal(audits, 4);
});

test('coverage repair reports every fragmented pair with candidate text in one repair', () => {
  const contract = { conditions: [], pairs: [{ key: 'FR-1|FR-2', ids: ['FR-1', 'FR-2'] }, { key: 'FR-2|FR-3', ids: ['FR-2', 'FR-3'] }], finalRecords: ['FR-1', 'FR-2', 'FR-3'].map((id) => ({ id, text: `Condition ${id}` })) };
  assert.throws(() => validateClarificationCoverage({ conditionCoverage: [], rulePairs: contract.pairs.map(({ key }) => ({ key, sameRule: true, reason: 'Branches of one counter.' })) }, contract), (error) => {
    const issue = error.details.issues[0];
    assert.equal(issue.pairs.length, 2);
    assert.deepEqual(issue.candidates, contract.finalRecords);
    assert.match(issue.repair, /одновременно/);
    return true;
  });
});

test('explicit absence and process statements can be excluded only with full answer evidence', () => {
  const condition = { key: 'GAP-4:0', text: 'Дополнительные правовые требования не заданы.', sourceKind: 'answer', required: true };
  const contract = { conditions: [condition], pairs: [], finalRecords: [] };
  const item = { key: condition.key, status: 'excluded', nonObligation: 'explicit-absence', sourceQuote: condition.text, reason: 'Это отсутствие новых обязательств, а не запрет поведения продукта.' };
  const certificate = (overrides = {}) => ({ conditionCoverage: [{ ...item, ...overrides }], rulePairs: [] });
  assert.doesNotThrow(() => validateClarificationCoverage(certificate(), contract));
  for (const overrides of [{ sourceQuote: 'не заданы' }, { sourceQuote: 'invented' }, { nonObligation: 'negative-requirement' }, { reason: '' }]) assert.throws(() => validateClarificationCoverage(certificate(overrides), contract));
  assert.throws(() => validateClarificationCoverage(certificate(), { ...contract, conditions: [{ ...condition, sourceKind: 'requirement' }] }));
  assert.doesNotThrow(() => validateClarificationCoverage(certificate({ nonObligation: 'process-context' }), contract));
});


test('contract repair names editable IDs and rejects readonly and future check targets explicitly', () => {
  const prompt = discussionRepairTargets({ content: { requirements: [{ id: 'BR-001' }, { id: 'FR-999', missing: true }], registryOverview: [{ id: 'FR-006' }] } }, { details: { requirementId: 'NFR-003', duplicate: false } });
  assert.match(prompt, /существующие ID[^:]+: \["BR-001"\]/);
  assert.match(prompt, /NFR-003/);
  assert.doesNotMatch(prompt, /FR-999/);
  assert.match(prompt, /даже со state="no-change"/);
  assert.match(prompt, /сервер сам присвоит им ID/);
});
