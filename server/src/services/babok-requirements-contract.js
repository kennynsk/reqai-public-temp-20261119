export const BABOK_OUTPUT_SCHEMA_VERSION = 'babok-requirements.v1';
export const BABOK_MODE = 'DECOMPOSITION';

export const BABOK_REQUIREMENT_TYPES = Object.freeze(['BR', 'SR', 'FR', 'NFR', 'TR', 'CON']);
export const BABOK_ANALYSIS_TYPES = Object.freeze(['GAP', 'HYP', 'TERM']);
export const BABOK_CONTEXT_TYPES = Object.freeze(['CTX']);
export const BABOK_ALL_RECORD_TYPES = Object.freeze([
  ...BABOK_REQUIREMENT_TYPES,
  ...BABOK_CONTEXT_TYPES,
  ...BABOK_ANALYSIS_TYPES,
]);

export const BABOK_OUTCOMES = Object.freeze(['COMPLETE', 'PARTIAL', 'INSUFFICIENT_CONTEXT']);
export const BABOK_PROVENANCE = Object.freeze(['Извлечено', 'Нормализовано', 'Предложено — требует подтверждения']);
export const BABOK_QUALITY = Object.freeze(['Готово', 'Требует уточнения', 'Конфликтует', 'Не тестируемо']);
export const BABOK_TRACEABILITY_STATUSES = Object.freeze(['Подтверждено источником', 'Предполагается']);
export const BABOK_DELTA_KINDS = Object.freeze(['новое', 'уточнено', 'изменено', 'заменено / исключено', 'дубликат', 'конфликт']);
export const BABOK_QUESTION_PRIORITIES = Object.freeze(['P0', 'P1', 'P2']);
export const BABOK_MATERIAL_STATUSES = Object.freeze(['AVAILABLE', 'NOT_PROVIDED', 'UNAVAILABLE']);

export const BABOK_OUTPUT_CONTRACT = Object.freeze({
  schemaVersion: BABOK_OUTPUT_SCHEMA_VERSION,
  mode: BABOK_MODE,
  outcome: BABOK_OUTCOMES,
  summary: Object.freeze({
    text: 'string',
    counts: Object.freeze(Object.fromEntries([...BABOK_ALL_RECORD_TYPES, 'DELTA'].map((type) => [type, 'integer']))),
    conclusions: 'string[]',
  }),
  context: Object.freeze({
    id: 'CTX-###',
    kind: 'string',
    text: 'string',
    source: 'citation',
    provenance: BABOK_PROVENANCE,
    quality: BABOK_QUALITY,
    relatedIds: 'record-id[]',
  }),
  groups: Object.freeze({
    BR: Object.freeze({ id: 'BR-###', text: 'string', successIndicator: 'string|null', source: 'citation', provenance: BABOK_PROVENANCE, quality: BABOK_QUALITY, relatedIds: 'record-id[]' }),
    SR: Object.freeze({ id: 'SR-###', role: 'string|null', text: 'string', relatedTo: 'record-id[]', source: 'citation', provenance: BABOK_PROVENANCE, quality: BABOK_QUALITY }),
    FR: Object.freeze({ id: 'FR-###', text: 'string', relatedTo: 'record-id[]', source: 'citation', provenance: BABOK_PROVENANCE, quality: BABOK_QUALITY }),
    NFR: Object.freeze({ id: 'NFR-###', category: 'string', text: 'string', scope: 'string|null', relatedTo: 'record-id[]', source: 'citation', provenance: BABOK_PROVENANCE, quality: BABOK_QUALITY, verificationMethod: 'string|null' }),
    TR: Object.freeze({ id: 'TR-###', text: 'string', completionCriterion: 'string|null', relatedTo: 'record-id[]', source: 'citation', provenance: BABOK_PROVENANCE, quality: BABOK_QUALITY }),
    CON: Object.freeze({ id: 'CON-###', obligation: 'string', text: 'string', source: 'citation', provenance: BABOK_PROVENANCE, scope: 'string|null', relatedTo: 'record-id[]', quality: BABOK_QUALITY }),
  }),
  analysis: Object.freeze({
    GAP: Object.freeze({ id: 'GAP-###', text: 'string', kind: 'string', affectedIds: 'record-id[]', nextStep: 'string|null', source: 'citation|null' }),
    HYP: Object.freeze({ id: 'HYP-###', text: 'string', affectedIds: 'record-id[]', nextStep: 'string|null', source: 'citation|null' }),
    TERM: Object.freeze({ id: 'TERM-###', term: 'string', meaning: 'string|null', affectedIds: 'record-id[]', nextStep: 'string|null', source: 'citation|null' }),
    traceability: Object.freeze({ from: 'record-id', to: 'record-id', relation: 'string', status: BABOK_TRACEABILITY_STATUSES, source: 'citation|null' }),
    delta: Object.freeze({ id: 'DELTA-###', baselineId: 'record-id|null', newId: 'record-id|null', kind: BABOK_DELTA_KINDS, comment: 'string', source: 'citation|null' }),
    questions: Object.freeze({ id: 'QUESTION-###', gapId: 'GAP-###', priority: BABOK_QUESTION_PRIORITIES, addressee: 'string', text: 'string' }),
  }),
  materials: Object.freeze({
    primary: 'material-descriptor',
    baseline: Object.freeze({ status: BABOK_MATERIAL_STATUSES, artifacts: 'material-descriptor[]' }),
    references: 'material-descriptor[]',
  }),
  scope: Object.freeze({
    partial: 'boolean',
    units: 'scope-unit[]',
  }),
});

function contractViolation(path, reason) {
  const error = new Error(`BABOK output is invalid at ${path}: ${reason}`);
  error.type = 'OUTPUT_CONTRACT_VIOLATION';
  error.code = 'BABOK_OUTPUT_INVALID';
  error.details = { path, reason };
  throw error;
}

function expectObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) contractViolation(path, 'expected an object');
  return value;
}

function expectArray(value, path) {
  if (!Array.isArray(value)) contractViolation(path, 'expected an array');
  return value;
}

function expectString(value, path, { nullable = false, nonEmpty = true } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== 'string' || (nonEmpty && !value.trim())) contractViolation(path, nullable ? 'expected a non-empty string or null' : 'expected a non-empty string');
  return value;
}

function expectBoolean(value, path) {
  if (typeof value !== 'boolean') contractViolation(path, 'expected a boolean');
  return value;
}

function expectEnum(value, allowed, path) {
  if (!allowed.includes(value)) contractViolation(path, `expected one of ${allowed.join(', ')}`);
  return value;
}

function expectStringArray(value, path) {
  const array = expectArray(value, path);
  if (array.some((item) => typeof item !== 'string' || !item.trim())) contractViolation(path, 'expected an array of non-empty strings');
  if (new Set(array).size !== array.length) contractViolation(path, 'must not contain duplicates');
  return array;
}

function expectIdentifier(value, path, prefix = null) {
  const text = expectString(value, path);
  if (!/^[A-Z]+-\d{3,}$/.test(text) || (prefix && !text.startsWith(`${prefix}-`))) contractViolation(path, `expected a stable ${prefix || 'record'} identifier`);
  return text;
}

function expectCitation(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const citation = expectObject(value, path);
  expectString(citation.artifactId, `${path}.artifactId`);
  expectString(citation.locator, `${path}.locator`);
  expectString(citation.quote, `${path}.quote`, { nullable: true });
  return citation;
}

function expectMaterialDescriptor(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const descriptor = expectObject(value, path);
  expectString(descriptor.artifactId, `${path}.artifactId`);
  expectEnum(descriptor.role, ['primary', 'baseline', 'reference'], `${path}.role`);
  expectString(descriptor.name, `${path}.name`, { nullable: true });
  if (descriptor.sha256 !== null && (typeof descriptor.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(descriptor.sha256))) {
    contractViolation(`${path}.sha256`, 'expected a SHA-256 hash or null');
  }
  expectEnum(descriptor.status, ['AVAILABLE', 'UNAVAILABLE'], `${path}.status`);
  return descriptor;
}

function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  try {
    return JSON.parse((fenced?.[1] || text).trim());
  } catch (error) {
    throw Object.assign(new Error('BABOK output must be valid JSON'), { type: 'OUTPUT_CONTRACT_VIOLATION', cause: error });
  }
}

export function parseBabokOutput(text) {
  const value = parseJson(text);
  return validateBabokRegistry(value);
}

export function validateBabokRegistry(value) {
  expectObject(value, '$');
  if (value.schemaVersion !== BABOK_OUTPUT_SCHEMA_VERSION) contractViolation('$.schemaVersion', `expected ${BABOK_OUTPUT_SCHEMA_VERSION}`);
  if (value.mode !== BABOK_MODE) contractViolation('$.mode', `expected ${BABOK_MODE}`);
  expectEnum(value.outcome, BABOK_OUTCOMES, '$.outcome');

  const summary = expectObject(value.summary, '$.summary');
  expectString(summary.text, '$.summary.text', { nullable: true, nonEmpty: false });
  const counts = expectObject(summary.counts, '$.summary.counts');
  for (const type of [...BABOK_ALL_RECORD_TYPES, 'DELTA']) {
    if (!Number.isInteger(counts[type]) || counts[type] < 0) contractViolation(`$.summary.counts.${type}`, 'expected a non-negative integer');
  }
  expectStringArray(summary.conclusions, '$.summary.conclusions');

  const context = expectArray(value.context, '$.context');
  const groups = expectObject(value.groups, '$.groups');
  for (const type of BABOK_REQUIREMENT_TYPES) expectArray(groups[type], `$.groups.${type}`);
  const analysis = expectObject(value.analysis, '$.analysis');
  for (const type of BABOK_ANALYSIS_TYPES) expectArray(analysis[type], `$.analysis.${type}`);
  expectArray(analysis.traceability, '$.analysis.traceability');
  expectArray(analysis.delta, '$.analysis.delta');
  expectArray(analysis.questions, '$.analysis.questions');

  const ids = new Map();
  const citationArtifactIds = [];
  const citation = (source, path, options) => {
    const value = expectCitation(source, path, options);
    if (value) citationArtifactIds.push({ artifactId: value.artifactId, path: `${path}.artifactId` });
    return value;
  };
  const rememberId = (id, path) => {
    if (ids.has(id)) contractViolation(path, `duplicate identifier ${id}; first used at ${ids.get(id)}`);
    ids.set(id, path);
  };
  const commonRequirement = (record, path, prefix, { provenance = true, sourceNullable = false } = {}) => {
    expectObject(record, path);
    const id = expectIdentifier(record.id, `${path}.id`, prefix);
    rememberId(id, `${path}.id`);
    expectString(record.text, `${path}.text`);
    citation(record.source, `${path}.source`, { nullable: sourceNullable });
    if (provenance) expectEnum(record.provenance, BABOK_PROVENANCE, `${path}.provenance`);
    expectEnum(record.quality, BABOK_QUALITY, `${path}.quality`);
    return id;
  };
  const related = [];
  context.forEach((record, index) => {
    const path = `$.context[${index}]`;
    const id = commonRequirement(record, path, 'CTX', { sourceNullable: true });
    expectString(record.kind, `${path}.kind`);
    expectStringArray(record.relatedIds, `${path}.relatedIds`);
    related.push({ path: `${path}.relatedIds`, ids: record.relatedIds });
  });
  for (const type of BABOK_REQUIREMENT_TYPES) {
    groups[type].forEach((record, index) => {
      const path = `$.groups.${type}[${index}]`;
      const id = commonRequirement(record, path, type, { provenance: type !== 'CON' });
      if (type === 'BR') {
        expectString(record.successIndicator, `${path}.successIndicator`, { nullable: true });
        expectStringArray(record.relatedIds, `${path}.relatedIds`);
        related.push({ path: `${path}.relatedIds`, ids: record.relatedIds });
      } else if (type === 'SR') {
        expectString(record.role, `${path}.role`, { nullable: true });
        expectStringArray(record.relatedTo, `${path}.relatedTo`);
        related.push({ path: `${path}.relatedTo`, ids: record.relatedTo });
      } else if (type === 'FR') {
        expectStringArray(record.relatedTo, `${path}.relatedTo`);
        related.push({ path: `${path}.relatedTo`, ids: record.relatedTo });
      } else if (type === 'NFR') {
        expectString(record.category, `${path}.category`);
        expectString(record.scope, `${path}.scope`, { nullable: true });
        expectString(record.verificationMethod, `${path}.verificationMethod`, { nullable: true });
        expectStringArray(record.relatedTo, `${path}.relatedTo`);
        related.push({ path: `${path}.relatedTo`, ids: record.relatedTo });
      } else if (type === 'TR') {
        expectString(record.completionCriterion, `${path}.completionCriterion`, { nullable: true });
        expectStringArray(record.relatedTo, `${path}.relatedTo`);
        related.push({ path: `${path}.relatedTo`, ids: record.relatedTo });
      } else if (type === 'CON') {
        expectString(record.obligation, `${path}.obligation`);
        expectEnum(record.provenance, BABOK_PROVENANCE, `${path}.provenance`);
        expectString(record.scope, `${path}.scope`, { nullable: true });
        expectStringArray(record.relatedTo, `${path}.relatedTo`);
        related.push({ path: `${path}.relatedTo`, ids: record.relatedTo });
      }
      return id;
    });
  }
  for (const type of BABOK_ANALYSIS_TYPES) {
    analysis[type].forEach((record, index) => {
      const path = `$.analysis.${type}[${index}]`;
      const id = expectIdentifier(record.id, `${path}.id`, type);
      rememberId(id, `${path}.id`);
      if (type === 'TERM') {
        expectString(record.term, `${path}.term`);
        expectString(record.meaning, `${path}.meaning`, { nullable: true });
      } else {
        expectString(record.text, `${path}.text`);
      }
      expectStringArray(record.affectedIds, `${path}.affectedIds`);
      expectString(record.nextStep, `${path}.nextStep`, { nullable: true });
      citation(record.source, `${path}.source`, { nullable: true });
      related.push({ path: `${path}.affectedIds`, ids: record.affectedIds });
    });
  }
  analysis.questions.forEach((question, index) => {
    const path = `$.analysis.questions[${index}]`;
    expectObject(question, path);
    const id = expectIdentifier(question.id, `${path}.id`, 'QUESTION');
    rememberId(id, `${path}.id`);
    const gapId = expectIdentifier(question.gapId, `${path}.gapId`, 'GAP');
    expectEnum(question.priority, BABOK_QUESTION_PRIORITIES, `${path}.priority`);
    expectString(question.addressee, `${path}.addressee`);
    expectString(question.text, `${path}.text`);
    related.push({ path: `${path}.gapId`, ids: [gapId] });
  });

  analysis.traceability.forEach((link, index) => {
    const path = `$.analysis.traceability[${index}]`;
    expectObject(link, path);
    expectString(link.from, `${path}.from`);
    expectString(link.to, `${path}.to`);
    expectString(link.relation, `${path}.relation`);
    expectEnum(link.status, BABOK_TRACEABILITY_STATUSES, `${path}.status`);
    citation(link.source, `${path}.source`, { nullable: true });
    related.push({ path: `${path}.from`, ids: [link.from] }, { path: `${path}.to`, ids: [link.to] });
  });
  analysis.delta.forEach((delta, index) => {
    const path = `$.analysis.delta[${index}]`;
    expectObject(delta, path);
    const id = expectIdentifier(delta.id, `${path}.id`, 'DELTA');
    rememberId(id, `${path}.id`);
    if (delta.baselineId !== null) expectIdentifier(delta.baselineId, `${path}.baselineId`);
    if (delta.newId !== null) related.push({ path: `${path}.newId`, ids: [expectIdentifier(delta.newId, `${path}.newId`)] });
    expectEnum(delta.kind, BABOK_DELTA_KINDS, `${path}.kind`);
    expectString(delta.comment, `${path}.comment`);
    citation(delta.source, `${path}.source`, { nullable: true });
  });

  for (const item of related) {
    for (const id of item.ids) {
      if (!ids.has(id)) contractViolation(item.path, `unknown record identifier ${id}`);
    }
  }
  for (const link of analysis.traceability) {
    if (!ids.has(link.from) || !ids.has(link.to)) contractViolation('$.analysis.traceability', 'traceability points to an unknown record identifier');
  }

  const materials = expectObject(value.materials, '$.materials');
  const primary = expectMaterialDescriptor(materials.primary, '$.materials.primary', { nullable: true });
  if (value.outcome !== 'INSUFFICIENT_CONTEXT' && !primary) contractViolation('$.materials.primary', 'a primary material is required unless context is insufficient');
  if (primary && primary.role !== 'primary') contractViolation('$.materials.primary.role', 'primary material must have role primary');
  const baseline = expectObject(materials.baseline, '$.materials.baseline');
  expectEnum(baseline.status, BABOK_MATERIAL_STATUSES, '$.materials.baseline.status');
  const baselineArtifacts = expectArray(baseline.artifacts, '$.materials.baseline.artifacts');
  baselineArtifacts.forEach((item, index) => {
    const descriptor = expectMaterialDescriptor(item, `$.materials.baseline.artifacts[${index}]`);
    if (descriptor.role !== 'baseline') contractViolation(`$.materials.baseline.artifacts[${index}].role`, 'baseline artifact must have role baseline');
  });
  if (baseline.status === 'AVAILABLE' && !baselineArtifacts.length) contractViolation('$.materials.baseline.artifacts', 'an available baseline must contain at least one artifact');
  if (baseline.status === 'NOT_PROVIDED' && baselineArtifacts.length) contractViolation('$.materials.baseline.artifacts', 'a missing baseline cannot contain artifacts');
  const references = expectArray(materials.references, '$.materials.references');
  references.forEach((item, index) => {
    const descriptor = expectMaterialDescriptor(item, `$.materials.references[${index}]`);
    if (descriptor.role !== 'reference') contractViolation(`$.materials.references[${index}].role`, 'reference artifact must have role reference');
  });

  const scope = expectObject(value.scope, '$.scope');
  expectBoolean(scope.partial, '$.scope.partial');
  const units = expectArray(scope.units, '$.scope.units');
  const unitIds = new Set();
  units.forEach((unit, index) => {
    const path = `$.scope.units[${index}]`;
    expectObject(unit, path);
    expectString(unit.id, `${path}.id`);
    if (unitIds.has(unit.id)) contractViolation(`${path}.id`, `duplicate scope unit ${unit.id}`);
    unitIds.add(unit.id);
    expectString(unit.artifactId, `${path}.artifactId`);
    expectEnum(unit.status, ['COMPLETE', 'PARTIAL', 'FAILED'], `${path}.status`);
    expectString(unit.section, `${path}.section`, { nullable: true });
    expectString(unit.note, `${path}.note`, { nullable: true });
  });

  const authorizedEvidenceArtifacts = new Set([
    ...(primary ? [primary.artifactId] : []),
    ...baselineArtifacts.map((item) => item.artifactId),
    ...references.map((item) => item.artifactId),
    ...units.map((item) => item.artifactId),
  ]);
  for (const citationValue of citationArtifactIds) {
    if (!authorizedEvidenceArtifacts.has(citationValue.artifactId)) {
      contractViolation(citationValue.path, `artifact ${citationValue.artifactId} is not part of the authorized materials or execution scope`);
    }
  }

  const expectedCounts = Object.fromEntries([
    ...BABOK_REQUIREMENT_TYPES.map((type) => [type, groups[type].length]),
    ['CTX', context.length],
    ...BABOK_ANALYSIS_TYPES.map((type) => [type, analysis[type].length]),
    ['DELTA', analysis.delta.length],
  ]);
  for (const [type, count] of Object.entries(expectedCounts)) {
    if (summary.counts[type] !== count) contractViolation(`$.summary.counts.${type}`, `expected ${count}, received ${summary.counts[type]}`);
  }
  return value;
}

export function validateBabokConsolidation(value, { failedChunks = [] } = {}) {
  validateBabokRegistry(value);
  if (value.materials.baseline.status !== 'AVAILABLE' && value.analysis.delta.length) {
    contractViolation('$.analysis.delta', 'delta is unavailable without an available baseline');
  }
  for (const delta of value.analysis.delta) {
    if (delta.kind !== 'новое' && !delta.baselineId) contractViolation('$.analysis.delta', `${delta.id} requires a baseline identifier`);
    if (delta.kind !== 'заменено / исключено' && !delta.newId) contractViolation('$.analysis.delta', `${delta.id} requires a new identifier`);
  }
  const unavailable = [
    ...value.materials.baseline.artifacts.filter((item) => item.status === 'UNAVAILABLE'),
    ...value.materials.references.filter((item) => item.status === 'UNAVAILABLE'),
  ];
  for (const material of unavailable) {
    const covered = value.analysis.GAP.some((gap) => gap.text.includes(material.artifactId) || gap.source?.artifactId === material.artifactId);
    if (!covered) contractViolation('$.analysis.GAP', `unavailable material ${material.artifactId} must have a GAP`);
  }
  if (failedChunks.length && value.outcome !== 'PARTIAL') contractViolation('$.outcome', 'failed execution units require PARTIAL outcome');
  if (value.outcome === 'PARTIAL' && !value.scope.partial) contractViolation('$.scope.partial', 'partial outcome requires partial scope');
  if (failedChunks.some((chunkId) => !value.scope.units.some((unit) => unit.id === chunkId || unit.artifactId === chunkId))) {
    contractViolation('$.scope.units', 'every failed execution unit must be represented in scope');
  }
  return value;
}

// Applied to new model-generated results, not historical or manually edited
// registries. Shape compatibility alone does not establish skill compliance.
export function collectBabokQualityIssues(value, { final = false } = {}) {
  validateBabokRegistry(value);
  const issues = [];
  const contractViolation = (path, reason) => issues.push({ path, reason });
  const gapIds = new Set(value.analysis.GAP.map((gap) => gap.id));
  const gapsFor = (record) => value.analysis.GAP.filter((gap) => gap.affectedIds.includes(record.id)
    || [...(record.relatedIds || []), ...(record.relatedTo || [])].includes(gap.id));
  for (const type of BABOK_REQUIREMENT_TYPES) {
    for (const [index, record] of value.groups[type].entries()) {
      const path = `$.groups.${type}[${index}]`;
      if (record.provenance === 'Предложено — требует подтверждения') {
        contractViolation(`${path}.provenance`, `${record.id}: предложенное требование нужно подтвердить или перенести в гипотезы.`);
      }
      if (record.quality === 'Требует уточнения' && !gapsFor(record).length) {
        contractViolation(`${path}.quality`, `${record.id}: отмечено «Требует уточнения», но не указана связь с пробелом GAP. Уточните, какие сведения отсутствуют.`);
      }
      if (type === 'NFR' && (!record.scope || !record.verificationMethod)) {
        contractViolation(path, `${record.id}: уточните область действия и способ проверки нефункционального требования.`);
      }
      if (type === 'SR' && record.quality === 'Готово' && !record.role) {
        contractViolation(`${path}.role`, `${record.id}: уточните роль заинтересованной стороны.`);
      }
      if (type === 'TR' && !record.completionCriterion) {
        contractViolation(`${path}.completionCriterion`, `${record.id}: уточните критерий завершения перехода.`);
      }
    }
  }
  if (value.summary.conclusions.length > 5) contractViolation('$.summary.conclusions', 'В резюме больше пяти выводов: выделите основные.');
  if (value.analysis.questions.length > 7) contractViolation('$.analysis.questions', 'В списке больше семи вопросов: уточните приоритеты.');
  if (final) {
    const records = BABOK_REQUIREMENT_TYPES.flatMap((type) => value.groups[type]);
    const linked = (parent, child) => (parent.relatedIds || []).includes(child.id)
      || (child.relatedTo || []).includes(parent.id)
      || value.analysis.traceability.some((link) => link.from === parent.id && link.to === child.id && link.status === 'Подтверждено источником');
    for (const record of [...value.groups.BR, ...value.groups.SR]) {
      const childTypes = record.id.startsWith('BR-') ? ['SR-'] : ['SR-', 'FR-', 'NFR-'];
      if (!records.some((child) => child.id !== record.id && childTypes.some((prefix) => child.id.startsWith(prefix)) && linked(record, child)) && !gapsFor(record).length) {
        contractViolation('$.analysis.GAP', `${record.id}: не показано покрытие дочерними требованиями или связь с пробелом GAP. Проверьте полноту декомпозиции.`);
      }
    }
    if (gapIds.size && !value.analysis.questions.length) contractViolation('$.analysis.questions', 'Для выявленных пробелов не сформулированы вопросы. Добавьте вопросы для уточнения.');
  }
  return issues;
}

export function validateBabokSkillResult(value, options = {}) {
  const [issue] = collectBabokQualityIssues(value, options);
  if (issue) contractViolation(issue.path, issue.reason);
  return value;
}

export function babokIdentifierSet(registry) {
  validateBabokRegistry(registry);
  const ids = [
    ...registry.context.map((item) => item.id),
    ...BABOK_REQUIREMENT_TYPES.flatMap((type) => registry.groups[type].map((item) => item.id)),
    ...BABOK_ANALYSIS_TYPES.flatMap((type) => registry.analysis[type].map((item) => item.id)),
    ...registry.analysis.delta.map((item) => item.id),
    ...registry.analysis.questions.map((item) => item.id),
  ];
  return Object.freeze([...new Set(ids)].sort());
}

export function createEmptyBabokRegistry({ outcome = 'INSUFFICIENT_CONTEXT' } = {}) {
  if (!BABOK_OUTCOMES.includes(outcome)) throw new Error(`Unsupported BABOK outcome ${outcome}`);
  const groups = Object.fromEntries(BABOK_REQUIREMENT_TYPES.map((type) => [type, []]));
  const analysis = Object.fromEntries(BABOK_ANALYSIS_TYPES.map((type) => [type, []]));
  analysis.traceability = [];
  analysis.delta = [];
  analysis.questions = [];
  const counts = Object.fromEntries([...BABOK_ALL_RECORD_TYPES, 'DELTA'].map((type) => [type, 0]));
  return {
    schemaVersion: BABOK_OUTPUT_SCHEMA_VERSION,
    mode: BABOK_MODE,
    outcome,
    summary: { text: '', counts, conclusions: [] },
    context: [],
    groups,
    analysis,
    materials: {
      primary: null,
      baseline: { status: 'NOT_PROVIDED', artifacts: [] },
      references: [],
    },
    scope: { partial: false, units: [] },
  };
}
