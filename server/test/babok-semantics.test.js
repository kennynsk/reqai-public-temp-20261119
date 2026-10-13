import assert from 'node:assert/strict';
import test from 'node:test';
import { BABOK_COMPACT_SEMANTIC_POLICY, BABOK_SEMANTIC_POLICY, deterministicSemanticIssues, researchNarrativeIssues, validateSemanticAudit } from '../src/domain/babok-semantics.js';
import { repairRevision } from '../src/domain/babok-repair-patch.js';

const candidate = (type, text, fields = {}) => ({ key: 'candidate', type, record: { text, ...fields } });
function audit(records) {
  return { schemaVersion: BABOK_SEMANTIC_POLICY, checks: records.map(({ key, type, record }) => ({
    key, text: record.text, classification: type, classificationReason: 'Один результат выбранного уровня.',
    obligations: [record.text], atomicityReason: 'Одно независимо согласуемое обязательство.',
    evidence: 'PROPOSED', evidenceReason: 'Предложение для согласования, не исходный факт.',
    verifiable: true, verificationReason: 'Метод проверяет заявленное правило в указанной области.',
    preservesOriginal: true, preservationReason: 'Исходные условия сохранены.', distinctOutcome: true, issues: [], repair: '',
  })) };
}

test('measurement-only BR from the live failure is rejected even when an auditor falsely approves it', () => {
  const records = [candidate('BR', 'Достижение бизнес-цели привлечения новых клиентов измеряется долей новых клиентов, совершивших первую операцию через сервис расчётов с резервированием, за установленный период после запуска.')];
  assert.equal(deterministicSemanticIssues(records)[0].code, 'BR_IS_MEASUREMENT');
  assert.throws(() => validateSemanticAudit(audit(records), records, { mode: 'RESEARCH' }), { type: 'BABOK_SEMANTIC_INVALID' });
  assert.equal(deterministicSemanticIssues([candidate('BR', 'Увеличить долю новых клиентов банка до 10% к концу года.')]).length, 0);
});

test('BR outcome and its metric field remain distinct; system calculation is not BR', () => {
  const records = [candidate('BR', 'Привлечь новых клиентов банка.', { successIndicator: '1000 клиентов за 6 месяцев' })];
  assert.equal(validateSemanticAudit(audit(records), records, { mode: 'RESEARCH' }).status, 'PASSED');
  assert.equal(deterministicSemanticIssues([candidate('BR', 'Система рассчитывает долю новых клиентов.')])[0].code, 'BR_IS_FUNCTION');
});

test('audit must cover every exact candidate once; summary approval, omission, stale text and duplicate checks fail', () => {
  const records = [candidate('FR', 'Решение направляет продавцу уведомление.')];
  for (const invalid of [{ passed: true }, { ...audit(records), checks: [] }, { ...audit(records), checks: [...audit(records).checks, ...audit(records).checks] }]) {
    assert.throws(() => validateSemanticAudit(invalid, records, { mode: 'RESEARCH' }), { type: 'BABOK_SEMANTIC_INVALID' });
  }
  const stale = audit(records); stale.checks[0].text = 'Другое требование';
  assert.throws(() => validateSemanticAudit(stale, records, { mode: 'RESEARCH' }), { type: 'BABOK_SEMANTIC_INVALID' });
});

test('independent actions, wrong class, unverified NFR and replacement loss cannot pass', () => {
  const records = [{ ...candidate('NFR', 'Повтор операции не создаёт второй финансовый эффект.', { category: 'надёжность', scope: 'Перечисление', verificationMethod: 'Повтор запроса и сверка движения средств' }), original: { text: 'Операция не создаёт второй эффект.' } }];
  for (const patch of [{ obligations: ['Резервирование', 'Перечисление'] }, { classification: 'FR' }, { verifiable: false }, { preservesOriginal: false }]) {
    const invalid = audit(records); Object.assign(invalid.checks[0], patch);
    assert.throws(() => validateSemanticAudit(invalid, records, { mode: 'RESEARCH' }), { type: 'BABOK_SEMANTIC_INVALID' });
  }
  const measurement = audit(records); measurement.checks[0].issues = ['Метод проверяет только часть области.'];
  assert.throws(() => validateSemanticAudit(measurement, records, { mode: 'RESEARCH' }), { type: 'BABOK_SEMANTIC_INVALID' });
});

test('decomposition requires supported scope; a proposal is insufficient and certificates bind all structured fields', () => {
  const records = [candidate('FR', 'Решение перечисляет средства продавцу.')];
  assert.throws(() => validateSemanticAudit(audit(records), records, { mode: 'DECOMPOSITION' }), { type: 'BABOK_SEMANTIC_INVALID' });
  const supported = audit(records); supported.checks[0].evidence = 'SUPPORTED';
  const certificate = validateSemanticAudit(supported, records, { mode: 'DECOMPOSITION' });
  const revised = [{ ...records[0], record: { ...records[0].record, source: 'changed' } }];
  assert.notEqual(certificate.contentHash, validateSemanticAudit(supported, revised, { mode: 'DECOMPOSITION' }).contentHash);
});

test('compact audit remains bound to its revision and cannot omit candidates or source coverage', () => {
  const records = [candidate('FR', 'Решение уведомляет продавца.')];
  const compact = { ...audit(records), schemaVersion: BABOK_COMPACT_SEMANTIC_POLICY, revision: repairRevision(records), coverageIssues: [] };
  assert.equal(validateSemanticAudit(compact, records, { mode: 'RESEARCH' }).status, 'PASSED');
  for (const invalid of [{ ...compact, revision: 'stale' }, { ...compact, checks: [] }, { ...compact, coverageIssues: ['Потеряно принятие условий до резервирования.'] }]) assert.throws(() => validateSemanticAudit(invalid, records, { mode: 'RESEARCH' }), { type: 'BABOK_SEMANTIC_INVALID' });
});

test('source coverage cannot omit conditions, skip a source sentence, or attest using only a hypothesis', async () => {
  const { sourceCoverageFor, validateSourceCoverage } = await import('../src/domain/babok-semantics.js');
  const registry = { groups: { FR: [{ id: 'FR-001', text: 'Резервировать деньги до исполнения условий.' }] }, context: [] };
  const coverage = sourceCoverageFor('Деньги резервируются до исполнения условий. Молчание не означает согласия.', registry);
  const audit = { sourceRevision: coverage.revision, sourceChecks: coverage.units.map((unit) => ({ key: unit.key, targetKeys: ['FR-001'], preservesConditions: true, issues: [] })) };
  assert.equal(validateSourceCoverage(audit, coverage).checks.length, 2);
  for (const bad of [ { ...audit, sourceChecks: audit.sourceChecks.slice(0,1) }, { ...audit, sourceChecks: audit.sourceChecks.map((c)=>({...c,preservesConditions:false})) }, { ...audit, sourceChecks: audit.sourceChecks.map((c)=>({...c,targetKeys:['HYP-001']})) }, { ...audit, sourceRevision: 'stale' } ]) assert.throws(() => validateSourceCoverage(bad,coverage), { type: 'BABOK_SEMANTIC_INVALID' });
});

test('the live solution-description-as-BR error is rejected even when the critic claims a business outcome', () => {
  const records = [{ key: 'BR-001', type: 'BR', record: { text: 'Обеспечить расчёты между покупателем и продавцом, при которых деньги резервируются до выполнения согласованных условий сделки.' } }];
  assert.equal(deterministicSemanticIssues(records)[0].code, 'BR_IS_SOLUTION_SCOPE');
  assert.deepEqual(deterministicSemanticIssues([{ key: 'BR-002', type: 'BR', record: { text: 'Привлечь новых клиентов банка.' } }]), []);
});

test('full insight text needs a fresh per-insight evidence audit, not only valid requirement proposals', async () => {
  const { narrativeCoverageFor, validateNarrativeAudit } = await import('../src/domain/babok-semantics.js');
  const coverage = narrativeCoverageFor([{ id: 'INS-001', detail: 'Источник подтвердил открытие и закрытие спора.', enhancements: [] }]);
  const valid = { narrativeRevision: coverage.revision, insightChecks: [{ key: 'INS-001', factsSupported: true, hypothesesLabelled: true, answersPreserved: true, issues: [] }] };
  assert.equal(validateNarrativeAudit(valid, coverage).checks.length, 1);
  for (const bad of [{ ...valid, insightChecks: [] }, { ...valid, narrativeRevision: 'stale' }, { ...valid, insightChecks: valid.insightChecks.map((c)=>({...c,factsSupported:false,reason:'Источник не называл конкретный механизм.'})) }]) assert.throws(()=>validateNarrativeAudit(bad,coverage),{type:'BABOK_SEMANTIC_INVALID'});
});

test('research cannot misquote a payment trigger as two existing actions or invent missing bank infrastructure', () => {
  const groups = { FR: [{ id: 'FR-005', text: 'После подтверждения передачи товара решение перечисляет зарезервированные средства продавцу.' }] };
  const insights = [{ id: 'INS-01', detail: 'Из материалов: FR-005 объединяет подтверждение передачи и перечисление.', enhancements: [{ rationale: 'FR-005 объединяет два действия.' }] }, { id: 'INS-08', detail: 'Вывод модели: у банка такой инфраструктуры нет.' }];
  assert.deepEqual(researchNarrativeIssues(insights, groups, 'Создать банковский сервис расчётов.').map((issue) => issue.code), ['UNSUPPORTED_CUSTOMER_STATE', 'FALSE_COMPOSITE_FR_CLAIM']);
  assert.deepEqual(researchNarrativeIssues([{ id: 'i', detail: 'Если у банка такой инфраструктуры нет, необходимо выбрать модель разрешения споров.' }], groups), []);
  assert.deepEqual(researchNarrativeIssues([{ id: 'i', detail: 'FR-005 содержит условие подтверждения. Отдельная фиксация события — предложение модели.' }], groups), []);
  assert.deepEqual(researchNarrativeIssues([insights[1]], groups, 'Известно, что у банка такой инфраструктуры нет.'), []);
  assert.deepEqual(researchNarrativeIssues([insights[0]], { FR: [{ id: 'FR-005', text: 'Решение фиксирует подтверждение и перечисляет средства.' }] }), []);
});
