const technical = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{23,}|\b(?:chunk|unit)(?:[-_: ]|\d|$)|\b(?:sha256|artifactId)\b/i;
const genericNames = /^(?:primary source|primary|baseline|baseline source|reference|reference source|requirements version|source)$/i;
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const usableName = (value) => clean(value) && !technical.test(value) && !genericNames.test(clean(value));

export function presentSource(source, materials = {}) {
  if (!source || typeof source !== 'object') return null;
  const primary = materials.primary;
  const baselines = [...(Array.isArray(materials.baseline) ? materials.baseline : materials.baseline?.artifacts || []), ...(materials.baseline?.artifactId ? [materials.baseline] : [])];
  const references = Array.isArray(materials.references) ? materials.references : [];
  const entries = [primary, ...baselines, ...references, ...(materials.artifacts || [])].filter(Boolean);
  const material = source.artifactId ? entries.find((item) => (item.artifactId || item.id) === source.artifactId) : null;
  const locator = clean(source.locator);
  const discussion = locator.match(/^discussion:(GAP-\d+)$/i);
  const accepted = clean(source.artifactId).startsWith('review-decision:');
  const role = material?.role || (material === primary && material ? 'primary' : baselines.includes(material) ? 'baseline' : references.includes(material) ? 'reference' : null);
  const fallback = role === 'baseline' ? 'Предыдущая версия' : role === 'reference' ? 'Справочный материал' : role === 'primary' ? 'Исходная бизнес-задача' : 'Источник требований';
  const name = [source.name, source.title, material?.name, material?.title, material?.filename].find(usableName);
  const label = discussion ? `Ответ на уточнение ${discussion[1]}` : accepted ? 'Принятое AI-предложение' : clean(name) || fallback;
  const location = discussion || accepted ? '' : locator === 'manual-review' ? 'Ручная формулировка' : locator === 'manual-research-review' ? 'AI-предложение после ручной проверки' : locator.startsWith('research:') ? 'AI-предложение' : !technical.test(locator) ? locator.replace(/^section:/i, 'Раздел ').replace(/^paragraph:/i, 'Абзац ').replace(/^page:/i, 'Страница ') : '';
  return { label, locator: location, quote: clean(source.quote) };
}
