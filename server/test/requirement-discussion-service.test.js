import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDiscussionContext, createRequirementDiscussionService, validateDiscussionProposal } from '../src/services/requirement-discussion-service.js';

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
  const generator = ({ signal }) => new Promise((resolve, reject) => { release = () => resolve({ text: JSON.stringify({ explanation: 'Опоздавший ответ', changes: [] }) }); signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true }); });
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
  assert.equal(first.attempt.promptVersion, '3.0.0');
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
        assert.match(messages[0].content, /Исправь только синтаксис/);
        return { text: JSON.stringify({ explanation: 'Уточнить', changes: [{ targetId, before: { text: 'Показывать статус' }, after: { text: 'Показывать текущий статус' }, rationale: 'Ответ владельца' }] }) };
      },
    });
    const turn = await service.generate({ auth: serviceAuth, jobId: 'job-1', anchorId: 'GAP-002', body: { message: 'Подготовь уточнение', clientMessageId: 'syntax-repair-001', baseVersionId: 'v1' } });
    assert.equal(calls, 2);
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
