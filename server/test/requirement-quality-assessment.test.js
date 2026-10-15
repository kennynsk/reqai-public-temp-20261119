import test from 'node:test';
import assert from 'node:assert/strict';
import { assessClarificationQuality, validateQualityAssessment } from '../src/services/requirement-quality-assessment.js';
import { qualityAssessmentContext, QUALITY_POLICY, qualityAssessmentIsCurrent } from '../src/services/requirement-quality-context.js';

function fixture() {
  const content = { groups: {
    BR: [{ id: 'BR-001', text: 'Снизить трудозатраты банка на 35%.', successIndicator: '20 → 13 минут на 1000 строк к шестому месяцу.', quality: 'Требует уточнения', relatedIds: ['GAP-002'] }],
    FR: [{ id: 'FR-001', text: 'Решение не повторяет проведённую выплату.', quality: 'Требует уточнения', relatedTo: ['GAP-001'] }],
    TR: [{ id: 'TR-001', text: 'Перевести клиентов на новый формат.', completionCriterion: null, quality: 'Требует уточнения', relatedTo: ['GAP-003'] }],
  }, analysis: { GAP: [
    { id: 'GAP-001', text: 'Как исключаются дубли?', affectedIds: ['FR-001'] },
    { id: 'GAP-002', text: 'Не утверждены SLA.', affectedIds: ['BR-001'] },
    { id: 'GAP-003', text: 'Не определён конец перехода.', affectedIds: ['TR-001'] },
  ] } };
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer: 'Сверять с учётом проведённых платежей.', stale: true } } } };
  const proposal = { changes: [], clarification: { gapId: 'GAP-001', answer: decisions.review.gaps['GAP-001'].answer, canResolve: true, remainingQuestions: [], checks: [{ requirementId: 'FR-001', state: 'no-change', reason: 'Запрет сохранён; механизм отражён в ответе.' }] } };
  return { content, decisions, proposal };
}
const verdicts = () => [{ id: 'BR-001', quality: 'Готово', reason: 'Цель и показатель определены; SLA другого уровня.', blockingGapIds: [] }, { id: 'FR-001', quality: 'Готово', reason: 'Результат и подтверждённый механизм определены.', blockingGapIds: [] }, { id: 'TR-001', quality: 'Требует уточнения', reason: 'Нет критерия завершения.', blockingGapIds: ['GAP-003'] }].map((item) => ({ ...item, evidence: [{ recordId: item.id, field: 'text', quote: Object.values(fixture().content.groups).flat().find((record) => record.id === item.id).text }] }));

test('a no-change clarification reassesses the full registry by type, with prospective closure and an honest remaining TR gap', async () => {
  const input = fixture();
  const assessment = await assessClarificationQuality({ ...input, methodology: 'BABOK', execute: async (messages) => {
    const prompt = messages[1].content;
    if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision: prompt.match(/"revision":"([a-f0-9]{16})"/)[1], checks: verdicts().map((item) => ({ id: item.id, pass: true, issues: [] })) }) };
    const context = JSON.parse(prompt.split('(данные):\n')[1].split('\nВерни')[0]);
    assert.equal(context.gaps[0].state, 'closed');
    assert.equal(context.gaps[0].stale, false);
    assert.equal(Object.hasOwn(context.records[0], 'quality'), false);
    assert.match(prompt, /BR не требует SLA/);
    assert.match(prompt, /старую quality не копируй/);
    assert.match(prompt, /Основание reason пиши кратко и понятным пользователю языком/);
    assert.match(prompt, /вместо scope пиши «объём задачи»/);
    assert.match(prompt, /её готовность не означает полноту набора или готовность всего проекта/);
    return { text: JSON.stringify({ schemaVersion: QUALITY_POLICY, revision: prompt.match(/"revision":"([a-f0-9]{16})"/)[1], assessments: verdicts() }) };
  } });
  assert.equal(assessment.assessments.filter((item) => item.quality === 'Готово').length, 2);
  assert.equal(qualityAssessmentIsCurrent(input.content, input.decisions, assessment), true);
  const changed = structuredClone(input.content); changed.groups.BR[0].successIndicator = 'Другой показатель';
  assert.equal(qualityAssessmentIsCurrent(changed, input.decisions, assessment), false);
  assert.equal(input.content.groups.FR[0].quality, 'Требует уточнения');
});

test('quality contracts reject partial, duplicated, stale and fabricated verdicts, and Ready without type-specific fields', () => {
  const { content } = fixture();
  const context = qualityAssessmentContext(content);
  const valid = () => ({ schemaVersion: QUALITY_POLICY, revision: 'revision', assessments: verdicts() });
  for (const change of [
    (value) => value.assessments.pop(),
    (value) => { value.assessments[1].id = 'BR-001'; },
    (value) => { value.revision = 'old'; },
    (value) => { value.assessments[0].quality = 'Ready'; },
    (value) => { value.assessments[0].reason = ''; },
    (value) => { value.assessments[2].quality = 'Готово'; value.assessments[2].blockingGapIds = []; },
  ]) {
    const value = valid(); change(value);
    assert.throws(() => validateQualityAssessment(value, context, 'revision'), { code: 'QUALITY_ASSESSMENT_INVALID' });
  }
  const closed = qualityAssessmentContext(content, { review: { gaps: { 'GAP-003': { state: 'closed' } } } });
  assert.throws(() => validateQualityAssessment(valid(), closed, 'revision'), /блокирующий GAP/);
});

test('invalid quality certificates get one bounded repair, with no fallback to promoting all closed-GAP records', async () => {
  const input = fixture(); let calls = 0;
  await assert.rejects(assessClarificationQuality({ ...input, methodology: 'BABOK', execute: async () => { calls++; return { text: '{"assessments":[]}' }; } }), { code: 'QUALITY_ASSESSMENT_INVALID' });
  assert.equal(calls, 2);
  assert.equal(input.content.groups.FR[0].quality, 'Требует уточнения');
});

test('accepted research scope is evidence for assessment and changing that decision invalidates the prepared result', () => {
  const { content, decisions } = fixture();
  decisions.review.proposals = { 'INS-001:0': { decision: 'accepted', targetId: 'FR-001', operation: 'add', after: content.groups.FR[0], confirmationConditions: 'Уточнить форму представления.' } };
  const basis = qualityAssessmentContext(content, decisions);
  assert.equal(basis.researchDecisions[0].decision, 'accepted');
  assert.deepEqual(basis.researchDecisions[0].after, content.groups.FR[0]);
  const changed = structuredClone(decisions); changed.review.proposals['INS-001:0'].decision = 'rejected';
  assert.equal(qualityAssessmentIsCurrent(content, changed, { basis }), false);
});

test('citations reject invented IDs, nonexistent fields and altered quotes; known references get real evidence', () => {
  const context = qualityAssessmentContext(fixture().content);
  for (const mutate of [
    (item) => { item.reason = 'Уже покрыто FR-999.'; },
    (item) => { item.evidence[0].recordId = 'FR-999'; },
    (item) => { item.evidence[0].field = 'algorithm'; },
    (item) => { item.evidence[0].quote = 'Созданы дополнительные требования.'; },
    (item) => { item.evidence = []; },
  ]) {
    const items = verdicts(); mutate(items[0]);
    assert.throws(() => validateQualityAssessment({ schemaVersion: QUALITY_POLICY, revision: 'rev', assessments: items }, context, 'rev'), { code: 'QUALITY_ASSESSMENT_INVALID' });
  }
  const items = verdicts(); items[0].reason = 'Покрыто FR-001.';
  const evaluated = validateQualityAssessment({ schemaVersion: QUALITY_POLICY, revision: 'rev', assessments: items }, context, 'rev');
  assert.deepEqual(evaluated[0].evidence[1], { recordId: 'FR-001', field: 'text', quote: context.records.find((record) => record.id === 'FR-001').text });
});

test('independent review repairs the real payroll error: planned requirements are not existing coverage', async () => {
  const input = fixture(); let evaluations = 0, reviews = 0;
  const result = await assessClarificationQuality({ ...input, methodology: 'BABOK', execute: async (messages) => {
    const revision = messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1];
    if (messages[0].content.includes('Независимая проверка оснований качества')) {
      reviews++;
      assert.match(messages[0].content, /«Нужно добавить» не означает «уже добавлено»/);
      assert.match(messages[0].content, /scopeConfirmed=true/);
      assert.match(messages[0].content, /BR не требует SLA/);
      return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision, checks: verdicts().map((item) => ({ id: item.id, pass: reviews > 1 || item.id !== 'FR-001', issues: reviews === 1 && item.id === 'FR-001' ? ['В реестре нет отдельных требований, заявленных как уже созданные.'] : [] })) }) };
    }
    evaluations++;
    const items = verdicts();
    if (evaluations === 1) items[1].reason = 'Дополнительные требования уже выделены.';
    else assert.match(messages.at(-1).content, /нет отдельных требований/);
    return { text: JSON.stringify({ schemaVersion: QUALITY_POLICY, revision, assessments: items }) };
  } });
  assert.equal(evaluations, 2); assert.equal(reviews, 2);
  assert.equal(result.semanticReview.pass, true);
  assert.doesNotMatch(result.assessments[1].reason, /уже выделены/);
});

test('persistent semantic rejection cannot publish a quality assessment', async () => {
  let calls = 0;
  await assert.rejects(assessClarificationQuality({ ...fixture(), methodology: 'BABOK', execute: async (messages) => {
    calls++;
    const revision = messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1];
    if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision, checks: verdicts().map((item) => ({ id: item.id, pass: false, issues: ['Основание не подтверждено.'] })) }) };
    return { text: JSON.stringify({ schemaVersion: QUALITY_POLICY, revision, assessments: verdicts() }) };
  } }), { code: 'QUALITY_ASSESSMENT_INVALID' });
  assert.equal(calls, 4);
});

test('missing BR success indicator gets exact citation repair with a consistent evidence contract', async () => {
  const input = fixture();
  input.content.groups.BR[0].successIndicator = null;
  let evaluations = 0;
  const result = await assessClarificationQuality({ ...input, methodology: 'BABOK', execute: async (messages) => {
    const prompt = messages[1].content;
    const revision = prompt.match(/"revision":"([a-f0-9]{16})"/)[1];
    if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision, checks: verdicts().map(({ id }) => ({ id, pass: true, issues: [] })) }) };
    evaluations++;
    assert.match(prompt.split('\nВерни')[1], /"evidence":\[/);
    assert.match(messages[2].content, /BR.successIndicator=null/);
    const assessments = verdicts();
    assessments[0].quality = 'Требует уточнения';
    assessments[0].reason = 'Показатель успеха не заполнен.';
    if (evaluations === 1) assessments[0].evidence = [{ recordId: 'BR-001', field: 'successIndicator', quote: 'Показатель не определён' }];
    else {
      const repair = messages.at(-1).content;
      assert.match(repair, /evidence\[0\].*recordId="BR-001".*field="successIndicator"/);
      assert.match(repair, /значение: null/);
      assert.ok(repair.includes(input.content.groups.BR[0].text));
      assert.match(repair, /Существующее поле text/);
    }
    return { text: JSON.stringify({ schemaVersion: QUALITY_POLICY, revision, assessments }) };
  } });
  assert.equal(evaluations, 2);
  assert.equal(result.assessments[0].quality, 'Требует уточнения');
  assert.deepEqual(result.assessments[0].evidence, verdicts()[0].evidence);
  assert.equal(input.content.groups.BR[0].successIndicator, null);
});

test('altered citation reports bounded source text and never repairs evidence silently', () => {
  const input = fixture();
  input.content.groups.BR[0].text = 'Настоящая формулировка. ' + 'Длинный текст '.repeat(500);
  const context = qualityAssessmentContext(input.content);
  const assessments = verdicts();
  assessments[0].evidence[0].quote = 'Выдуманная цитата '.repeat(500);
  const original = structuredClone(assessments);
  assert.throws(() => validateQualityAssessment({ schemaVersion: QUALITY_POLICY, revision: 'rev', assessments }, context, 'rev'), (error) => {
    assert.equal(error.code, 'QUALITY_ASSESSMENT_INVALID');
    assert.match(error.message, /evidence\[0\].*field="text"/);
    assert.match(error.message, /Начало исходного поля/);
    assert.ok(error.message.includes(input.content.groups.BR[0].text.slice(0, 600)));
    assert.ok(error.message.length < 1600);
    return true;
  });
  assert.deepEqual(assessments, original);
});

test('quality assessment includes prospective additions but keeps its basis bound to the original registry', async () => {
  const input = fixture();
  const record = { id: 'SR-001', text: 'Клиенту нужна возможность возобновить сервис.', role: 'Клиент', quality: 'Требует уточнения', relatedTo: ['GAP-001'] };
  input.proposal.additions = [{ type: 'SR', record, rationale: 'Подтверждено.' }];
  input.proposal.clarification.checks.push({ requirementId: record.id, state: 'incorporated', reason: 'Добавлена потребность.' });
  const assessments = [...verdicts(), { id: record.id, quality: 'Готово', reason: 'Роль и потребность определены.', blockingGapIds: [], evidence: [{ recordId: record.id, field: 'text', quote: record.text }] }];
  const result = await assessClarificationQuality({ ...input, methodology: 'BABOK', execute: async (messages) => {
    const revision = messages[1].content.match(/"revision":"([a-f0-9]{16})"/)[1];
    if (messages[0].content.includes('Независимая проверка оснований качества')) return { text: JSON.stringify({ schemaVersion: 'babok-quality-review.v1', revision, checks: assessments.map(({ id }) => ({ id, pass: true, issues: [] })) }) };
    const context = JSON.parse(messages[1].content.split('(данные):\n')[1].split('\nВерни')[0]);
    assert.equal(context.records.find((item) => item.id === record.id).text, record.text);
    return { text: JSON.stringify({ schemaVersion: QUALITY_POLICY, revision, assessments }) };
  } });
  assert.equal(result.assessedRecords.some((item) => item.id === record.id), true);
  assert.equal(result.basis.records.some((item) => item.id === record.id), false);
  assert.equal(input.content.groups.SR, undefined);
  assert.equal(qualityAssessmentIsCurrent(input.content, input.decisions, result), true);
});
