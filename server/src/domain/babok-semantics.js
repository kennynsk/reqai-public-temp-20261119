import { canonicalSha256 } from '../prompts/prompt-utils.js';

export const BABOK_SEMANTIC_POLICY = 'babok-semantic.v1';
export const BABOK_COMPACT_SEMANTIC_POLICY = 'babok-semantic.v2';
const TYPES = new Set(['BR', 'SR', 'FR', 'NFR', 'TR', 'CON']);
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());

export function registrySemanticRecords(registry) {
  return Object.entries(registry.groups).flatMap(([type, records]) => records.map((record) => ({ key: record.id, type, record })));
}

export function sourceCoverageFor(source, registry) {
  let text = source;
  try { text = JSON.parse(source).content || source; } catch { /* plain source */ }
  const units = String(text || '').split(/(?<=[.!?])\s+|\n+/u).map((text) => text.trim()).filter(Boolean).map((text, index) => ({ key: `SOURCE-${index + 1}`, text }));
  const targets = [...registrySemanticRecords(registry), ...registry.context.map((record) => ({ key: record.id, type: 'CTX', record }))];
  return { revision: canonicalSha256({ units, targets }).slice(0, 16), units, targets };
}

export function validateSourceCoverage(audit, coverage) {
  const fail = (key, reason) => ({ key, code: 'SOURCE_CONDITION_LOST', reason, repair: 'Сохранить каждое явно заданное условие первичного источника в требованиях или подтверждённом бизнес-правиле CTX. Не переносить подтверждённое поведение в HYP из-за неверной классификации CON.' });
  if (!coverage.units.length || audit?.sourceRevision !== coverage.revision || !Array.isArray(audit.sourceChecks)) throw semanticViolation([fail('$source', 'Проверка должна ссылаться на текущий первичный источник и все его фрагменты.')]);
  const expected = new Set(coverage.units.map((unit) => unit.key)), targets = new Set(coverage.targets.map((target) => target.key)), seen = new Set(), issues = [];
  for (const check of audit.sourceChecks) {
    if (!expected.has(check.key) || seen.has(check.key)) issues.push(fail(check.key, 'Неизвестный или повторный фрагмент источника.'));
    seen.add(check.key);
    if (check.preservesConditions !== true || !Array.isArray(check.targetKeys) || !check.targetKeys.length || check.targetKeys.some((key) => !targets.has(key)) || !Array.isArray(check.issues) || check.issues.length) issues.push(fail(check.key, check.reason || 'Исходное обязательство, условие или контекст не сохранены в указанных записях.'));
  }
  for (const key of expected) if (!seen.has(key)) issues.push(fail(key, 'Фрагмент первичного источника не проверен.'));
  if (issues.length) throw semanticViolation(issues);
  return { revision: coverage.revision, contentHash: canonicalSha256(coverage), checks: audit.sourceChecks };
}

export function narrativeCoverageFor(insights) {
  const records = insights.map((record) => ({ key: record.id, record }));
  return { revision: canonicalSha256(records).slice(0, 16), records };
}

export function qualityIssuesToSemanticIssues(registry, qualityIssues) {
  return qualityIssues.flatMap((issue) => {
    if (issue.path === '$.analysis.questions' && registry.analysis.questions.length > 7 && /больше семи/u.test(issue.reason)) {
      const rank = { P0: 0, P1: 1, P2: 2 };
      const priorityOrder = registry.analysis.questions.map((question, index) => ({ question, index }))
        .sort((a, b) => rank[a.question.priority] - rank[b.question.priority] || a.index - b.index);
      return priorityOrder.slice(7).map(({ question }) => ({ key: question.id, code: 'BABOK_PRIORITY_QUESTION_LIMIT',
        reason: `${question.id}: вопрос выходит за пределы семи приоритетных вопросов.`,
        repair: 'Удалить только эту запись QUESTION из приоритетного списка, сохранив её GAP, требования и все исходные условия.' }));
    }
    return [{ key: issue.reason.match(/^[A-Z]+-\d+/u)?.[0] || '$quality', code: 'BABOK_QUALITY_INVALID', reason: issue.reason,
      repair: 'Исправить пробел, статус или трассировку, сохранив подтверждённый смысл.' }];
  });
}

export function researchNarrativeIssues(insights, groups = {}, businessContext = '') {
  const issues = [];
  const bankInfrastructure = /у\s+банка\s+(?:нет\s+(?:такой\s+)?инфраструктуры|такой\s+инфраструктуры\s+нет)/iu;
  for (const insight of insights) {
    const text = [insight.title, insight.summary, insight.detail, insight.rationale].join('\n');
    const assertion = bankInfrastructure.exec(text);
    if (assertion && !bankInfrastructure.test(businessContext) && !/если\s*$/iu.test(text.slice(Math.max(0, assertion.index - 12), assertion.index))) {
      issues.push({ key: insight.id, code: 'UNSUPPORTED_CUSTOMER_STATE', reason: 'Отсутствие инфраструктуры у конкретного банка не следует из предоставленной задачи.',
        repair: 'Сравнивать модели обслуживания как гипотезы. Наличие инфраструктуры заказчика неизвестно; сформулировать условие или вопрос, а не отсутствие как факт.' });
    }
  }
  for (const requirement of groups.FR || []) {
    // A confirmation in the trigger of a transfer does not assert a separate
    // registration operation. Do not allow research to misquote that FR as
    // containing two actions, even when the proposed registration is useful.
    if (!/^(?:после|при)\s+подтверждени[яи]\s+передачи\s+товара[\s,]+(?:решение|система|сервис)?[\s,]*перечисл/iu.test(requirement.text)) continue;
    const claim = new RegExp(`${requirement.id}\\s+(?:объединяет|совмещает)\\s+(?:два\\s+действия|подтверждение|фиксацию)`, 'iu');
    for (const insight of insights) {
      const text = [insight.title, insight.summary, insight.detail, insight.rationale, ...(insight.enhancements || []).map((item) => item.rationale)].join('\n');
      if (claim.test(text)) issues.push({ key: insight.id, code: 'FALSE_COMPOSITE_FR_CLAIM',
        reason: `${requirement.id} задаёт одно действие перечисления с условием подтверждения; отдельная фиксация события не входит в его текст.`,
        repair: 'Исправить атрибуцию в тексте инсайта и rationale: фиксация подтверждения — новое предложение модели, а не исправление неатомарности исходного FR. Сохранить полезные предложения и исходный триггер.' });
    }
  }
  return issues;
}

export function validateNarrativeAudit(audit, coverage) {
  const issue = (key, reason) => ({ key, code: 'INSIGHT_EVIDENCE_INVALID', reason, repair: 'Исправить текст инсайта: отделить подтверждённые факты источника от аналитических гипотез и будущих механизмов; сохранить согласованные ответы.' });
  if (audit?.narrativeRevision !== coverage.revision || !Array.isArray(audit.insightChecks)) throw semanticViolation([issue('$insights', 'Независимая проверка должна охватывать точный полный текст всех инсайтов.')]);
  const expected = new Set(coverage.records.map((record) => record.key)), seen = new Set(), problems = [];
  for (const check of audit.insightChecks) {
    if (!expected.has(check.key) || seen.has(check.key)) problems.push(issue(check.key, 'Неизвестный или повторный инсайт.'));
    seen.add(check.key);
    if (check.factsSupported !== true || check.hypothesesLabelled !== true || check.answersPreserved !== true || !Array.isArray(check.issues) || check.issues.length) problems.push(issue(check.key, check.reason || check.issues?.join('; ') || 'В тексте смешаны факты и гипотезы либо потерян согласованный ответ.'));
  }
  for (const key of expected) if (!seen.has(key)) problems.push(issue(key, 'Текст инсайта не проверен.'));
  if (problems.length) throw semanticViolation(problems);
  return { revision: coverage.revision, contentHash: canonicalSha256(coverage), checks: audit.insightChecks };
}

export function insightSemanticRecords(insights, groups) {
  return insights.flatMap((insight) => insight.enhancements.map((record, index) => ({
    key: `${insight.id}:${index}`, type: record.targetType, record,
    ...(record.operation === 'replace' ? { original: groups[record.targetType]?.find((item) => item.id === record.targetId) } : {}),
  })));
}

// These are unambiguous category errors, not a general keyword classifier.
// A business outcome may contain a measure; a statement *about measuring* that
// outcome belongs in its successIndicator or in a separate measurement FR.
export function deterministicSemanticIssues(records) {
  return records.flatMap(({ key, type, record }) => {
    const text = String(record.text || '').trim();
    const issues = [];
    if (type === 'BR' && /^(?:(?:достижение|успех|результат|показатель|метрик[а-яё]*)(?=\s|[.!?:;,]|$)[^.!?]*\s(?:измеря[а-яё]*|оценива[а-яё]*|рассчитыва[а-яё]*)|(?:измерять|измерение|рассчитывать|расчёт показателя|определять показатель)(?=\s|[.!?:;,]|$))/iu.test(text)) {
      issues.push({ key, code: 'BR_IS_MEASUREMENT', reason: 'Способ измерения существующего бизнес-результата не является самостоятельным BR.', repair: 'Уточнить successIndicator исходного BR через replace, сохранив его text; если требуется действие решения по расчёту, предложить отдельный FR.' });
    }
    if (type === 'BR' && /^(?:система|решение|сервис|приложение)\s+(?:показывает|отображает|фиксирует|регистрирует|рассчитывает|уведомляет|перечисляет|резервирует)(?=\s|[.!?:;,]|$)/iu.test(text)) {
      issues.push({ key, code: 'BR_IS_FUNCTION', reason: 'Наблюдаемое действие решения классифицировано как бизнес-результат.', repair: 'Классифицировать действие как FR; бизнес-цель сохранить в BR.' });
    }
    if (type === 'BR' && /^(?:создать|разработать|реализовать|обеспечить)\s+(?:сервис|решение|процесс|расч[её]ты|проведение расч[её]тов)(?=\s|[.!?:;,]|$)/iu.test(text)) {
      issues.push({ key, code: 'BR_IS_SOLUTION_SCOPE', reason: 'Описание создания или поведения решения не является самостоятельным бизнес-результатом.', repair: 'Перенести описание решения в CTX, подтверждённое поведение сохранить в SR/FR. Самостоятельную цель организации сохранить в BR; трассировку перепроверить, не выдавать общий scope за доказательство вклада в цель.' });
    }
    if (type === 'NFR' && ['category', 'scope', 'verificationMethod'].some((field) => !nonempty(record[field]))) {
      issues.push({ key, code: 'NFR_NOT_VERIFIABLE', reason: 'У NFR отсутствует категория, область или метод проверки.', repair: 'Предложить конкретную проверку всей области либо оставить пробел без NFR.' });
    }
    return issues;
  });
}

export function semanticViolation(issues) {
  return Object.assign(new Error('AI result failed BABOK semantic validation'), {
    type: 'BABOK_SEMANTIC_INVALID', code: 'BABOK_SEMANTIC_INVALID', details: { policy: BABOK_SEMANTIC_POLICY, issues },
  });
}

export function validateSemanticAudit(value, records, { mode }) {
  if (value?.schemaVersion === BABOK_COMPACT_SEMANTIC_POLICY) {
    const revision = canonicalSha256(records).slice(0, 16);
    if (value.revision !== revision || !Array.isArray(value.coverageIssues)) throw semanticViolation([{ key: '$', code: 'SEMANTIC_AUDIT_INVALID', reason: 'Compact audit must bind the exact revision and check source coverage' }]);
    const candidates = new Map(records.map((item) => [item.key, item]));
    const expanded = { schemaVersion: BABOK_SEMANTIC_POLICY, checks: Array.isArray(value.checks) ? value.checks.map((check) => ({
      ...check, text: candidates.get(check.key)?.record.text,
      classificationReason: check.reason || 'Независимая классификация по BABOK.', atomicityReason: check.reason || 'Проверены отдельно согласуемые обязательства.',
      evidenceReason: check.reason || 'Проверено происхождение относительно материалов.', verificationReason: check.reason || 'Сопоставлены правило, область и метод проверки.',
      preservationReason: check.reason || 'Сверены исходные условия и результат.',
    })) : value.checks };
    const validation = validateSemanticAudit(expanded, records, { mode });
    if (value.coverageIssues.length) throw semanticViolation(value.coverageIssues.map((reason) => ({ key: '$coverage', code: 'SOURCE_COVERAGE_LOST', reason: String(reason), repair: 'Восстановить явно названные обязательства источника; не выдумывать неизвестные детали.' })));
    return { ...validation, policy: BABOK_COMPACT_SEMANTIC_POLICY, revision };
  }
  const problems = [...deterministicSemanticIssues(records)];
  const invalid = (key, reason) => problems.push({ key, code: 'SEMANTIC_AUDIT_INVALID', reason, repair: 'Повторить независимую проверку точного результата со всеми обязательными полями.' });
  if (!value || value.schemaVersion !== BABOK_SEMANTIC_POLICY || !Array.isArray(value.checks)) {
    throw semanticViolation([...problems, { key: '$', code: 'SEMANTIC_AUDIT_INVALID', reason: 'Missing semantic audit contract', repair: 'Вернуть JSON заданного контракта checks.' }]);
  }
  const expected = new Map(records.map((item) => [item.key, item]));
  if (expected.size !== records.length) invalid('$', 'Duplicate candidate keys');
  const seen = new Set();
  for (const check of value.checks) {
    const candidate = expected.get(check?.key);
    if (!candidate || seen.has(check.key)) { invalid(check?.key || '$', 'Unknown or duplicate check'); continue; }
    seen.add(check.key);
    if (check.text !== candidate.record.text) { invalid(check.key, 'Audit does not match the exact candidate text'); continue; }
    if (!TYPES.has(check.classification) && !['METRIC', 'CTX', 'GAP', 'HYP'].includes(check.classification)) invalid(check.key, 'Missing classification');
    if (check.classification !== candidate.type) problems.push({ key: check.key, code: 'WRONG_CLASSIFICATION', reason: `${candidate.type} должен быть ${check.classification}: ${check.classificationReason || ''}`, repair: check.repair || 'Исправить тип или внести значение в структурное поле существующего требования.' });
    for (const field of ['classificationReason', 'atomicityReason', 'evidenceReason', 'verificationReason', 'preservationReason']) if (!nonempty(check[field])) invalid(check.key, `Missing ${field}`);
    if (!Array.isArray(check.obligations) || check.obligations.some((item) => !nonempty(item))) invalid(check.key, 'Missing independently testable obligations');
    else if (check.obligations.length !== 1) problems.push({ key: check.key, code: 'NON_ATOMIC', reason: `${check.atomicityReason || ''} Обязательства: ${check.obligations.join('; ')}`, repair: 'Разделить независимо согласуемые результаты на отдельные записи; сохранить все обязательства и условия.' });
    const evidence = mode === 'RESEARCH' && candidate.type !== 'CON' ? ['PROPOSED', 'SUPPORTED'] : ['SUPPORTED'];
    if (!evidence.includes(check.evidence)) problems.push({ key: check.key, code: 'UNSUPPORTED_SCOPE', reason: check.evidenceReason || 'Scope is not supported', repair: mode === 'RESEARCH' ? 'Явно оформить гипотезу и условия согласования.' : 'Неподтверждённый смысл перенести в HYP/GAP; подтверждённые обязательства сохранить.' });
    if (typeof check.verifiable !== 'boolean' || typeof check.preservesOriginal !== 'boolean' || typeof check.distinctOutcome !== 'boolean') invalid(check.key, 'Missing semantic verdicts');
    if (candidate.type === 'NFR' && check.verifiable !== true) problems.push({ key: check.key, code: 'NFR_NOT_VERIFIABLE', reason: check.verificationReason || 'Method does not verify the whole scope', repair: 'Согласовать правило с областью и воспроизводимым тестом; независимые виды операций разделить.' });
    if (candidate.original && check.preservesOriginal !== true) problems.push({ key: check.key, code: 'REPLACEMENT_LOSES_MEANING', reason: check.preservationReason || 'Original obligation lost', repair: 'Вернуть все исходные условия; независимое поведение вынести в add.' });
    if (candidate.type === 'BR' && check.distinctOutcome !== true) problems.push({ key: check.key, code: 'BR_NOT_DISTINCT_OUTCOME', reason: check.classificationReason || 'Not a distinct business outcome', repair: 'Не создавать BR из метрики или способа достижения; уточнить существующий BR или выделить действие FR.' });
    if (!Array.isArray(check.issues) || check.issues.some((item) => !nonempty(item))) invalid(check.key, 'Missing issues array');
    else for (const reason of check.issues) problems.push({ key: check.key, code: 'SEMANTIC_REVIEW_FINDING', reason, repair: check.repair || 'Исправить нарушение скилла без потери исходного смысла.' });
  }
  for (const key of expected.keys()) if (!seen.has(key)) invalid(key, 'Candidate was not audited');
  if (problems.length) throw semanticViolation(problems);
  return {
    policy: BABOK_SEMANTIC_POLICY, status: 'PASSED', mode,
    contentHash: canonicalSha256(records),
    checks: value.checks.map((check) => ({ ...check, recordHash: canonicalSha256(expected.get(check.key)) })),
  };
}
