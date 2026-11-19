import { presentSource } from './source-presentation.js';

const LEGACY_TYPE_LABELS = {
  business: 'Бизнес-требование',
  functional: 'Функциональное требование',
  nonfunctional: 'Нефункциональное требование',
};

const BABOK_TYPE_LABELS = {
  BR: 'Бизнес-требование',
  SR: 'Требование заинтересованной стороны',
  FR: 'Функциональное требование',
  NFR: 'Нефункциональное требование',
  TR: 'Требование перехода',
  CON: 'Требование соответствия',
  CTX: 'Контекст',
  GAP: 'Пробел',
  HYP: 'Гипотеза',
  TERM: 'Термин',
  DELTA: 'Изменение',
  QUESTION: 'Вопрос',
};

const DEFAULT_BABOK_REQUIREMENT_TYPES = ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON'];
const DEFAULT_BABOK_ANALYSIS_TYPES = ['GAP', 'HYP', 'TERM'];

const FALLBACK_CATEGORY_META = {
  label: 'Другие результаты',
  color: 'bg-slate-100 text-slate-700',
  active: 'bg-slate-700 text-white',
  icon: null,
};

function textValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

function idList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(textValue).filter(Boolean))];
}

export function normalizeApplicability(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, number));
}

export function humanReadableSource(source, materials) {
  return presentSource(source, materials);
}

function normalizeRequirementRecord(type, item, index, materials, typeLabels) {
  const raw = typeof item === 'string' ? { text: item } : (item && typeof item === 'object' ? item : {});
  const id = textValue(raw.id) || `${type}-${String(index + 1).padStart(3, '0')}`;
  const wording = textValue(raw.text || raw.description || raw.comment || (raw.term ? `${raw.term}: ${raw.meaning || ''}` : ''));
  const relationships = idList([
    ...(Array.isArray(raw.relatedIds) ? raw.relatedIds : []),
    ...(Array.isArray(raw.relatedTo) ? raw.relatedTo : []),
    ...(Array.isArray(raw.related) ? raw.related : []),
    ...(Array.isArray(raw.affectedIds) ? raw.affectedIds : []),
  ]);
  return {
    id,
    type,
    typeLabel: typeLabels[type] || `${type} · Требование`,
    text: wording || 'Формулировка отсутствует',
    quality: textValue(raw.quality),
    source: humanReadableSource(raw.source, materials),
    relationships,
  };
}

export function createRequirementIndex(records = []) {
  const normalized = [];
  const byId = new Map();
  records.forEach((record) => {
    if (!record?.id || byId.has(record.id)) return;
    const frozen = Object.freeze({ ...record, relationships: Object.freeze([...(record.relationships || [])]) });
    normalized.push(frozen);
    byId.set(record.id, frozen);
  });
  const immutableRecords = Object.freeze(normalized);
  return Object.freeze({
    records: immutableRecords,
    get(id) {
      return byId.get(textValue(id)) || null;
    },
  });
}

export function buildLegacyRequirementIndex(baseRequirements, { materials } = {}) {
  const records = [];
  ['business', 'functional', 'nonfunctional'].forEach((type) => {
    const items = Array.isArray(baseRequirements?.[type]) ? baseRequirements[type] : [];
    items.forEach((item, index) => records.push(normalizeRequirementRecord(type, item, index, materials, LEGACY_TYPE_LABELS)));
  });
  return createRequirementIndex(records);
}

export function buildBabokRequirementIndex(baseRegistry, { requirementTypes = DEFAULT_BABOK_REQUIREMENT_TYPES, analysisTypes = DEFAULT_BABOK_ANALYSIS_TYPES } = {}) {
  const records = [];
  const seen = new Set();
  const add = (type, item, index) => {
    const record = normalizeRequirementRecord(type, item, index, baseRegistry?.materials, BABOK_TYPE_LABELS);
    if (seen.has(record.id)) return;
    seen.add(record.id);
    records.push(record);
  };
  (Array.isArray(baseRegistry?.context) ? baseRegistry.context : []).forEach((item, index) => add('CTX', item, index));
  requirementTypes.forEach((type) => (Array.isArray(baseRegistry?.groups?.[type]) ? baseRegistry.groups[type] : []).forEach((item, index) => add(type, item, index)));
  analysisTypes.forEach((type) => (Array.isArray(baseRegistry?.analysis?.[type]) ? baseRegistry.analysis[type] : []).forEach((item, index) => add(type, item, index)));
  (Array.isArray(baseRegistry?.analysis?.delta) ? baseRegistry.analysis.delta : []).forEach((item, index) => add('DELTA', item, index));
  (Array.isArray(baseRegistry?.analysis?.questions) ? baseRegistry.analysis.questions : []).forEach((item, index) => add('QUESTION', item, index));
  return createRequirementIndex(records);
}

export function resolveRequirementPreview(index, id) {
  const requestedId = textValue(id);
  const record = index?.get?.(requestedId);
  return record ? { status: 'available', id: requestedId, record } : { status: 'unavailable', id: requestedId };
}

export function buildInsightPresentation(insight, { categoryMeta = {}, enhancements = [], fallbackId = 'insight' } = {}) {
  const raw = insight && typeof insight === 'object' ? insight : {};
  const id = textValue(raw.id) || fallbackId;
  const rawCategory = textValue(raw.category);
  const knownCategory = Boolean(categoryMeta[rawCategory]);
  const categoryKey = knownCategory ? rawCategory : 'unknown';
  const meta = categoryMeta[rawCategory] || FALLBACK_CATEGORY_META;
  const normalizedEnhancements = (Array.isArray(enhancements) ? enhancements : []).map((enhancement, index) => ({
    ...enhancement,
    key: enhancement.key || `${id}:${enhancement.sourceIndex ?? index}`,
    targetIds: idList(enhancement.targetIds || enhancement.relatedTo),
  }));
  return {
    ...raw,
    id,
    category: rawCategory || 'unknown',
    categoryKey,
    categoryLabel: meta.label,
    categoryMeta: meta,
    title: textValue(raw.title) || 'Без названия',
    summary: textValue(raw.summary).replace(/^Знания модели\s*\(без внешней проверки\)\s*:\s*/iu, ''),
    detail: textValue(raw.detail),
    noEnhancementReason: textValue(raw.noEnhancementReason),
    applicability: normalizeApplicability(raw.applicability),
    sourceTypes: idList(raw.source_types),
    relatedTo: idList(raw.relatedTo),
    rationale: textValue(raw.rationale),
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    enhancements: normalizedEnhancements,
  };
}

export function filterInsightPresentations(insights, activeFilter = 'all') {
  if (activeFilter === 'all') return insights;
  return insights.filter((insight) => insight.categoryKey === activeFilter);
}

export function ensureSelectedInsightId(selectedId, visibleInsights) {
  if (visibleInsights.some((insight) => insight.id === selectedId)) return selectedId;
  return visibleInsights[0]?.id || null;
}

export { BABOK_TYPE_LABELS, FALLBACK_CATEGORY_META, LEGACY_TYPE_LABELS };
