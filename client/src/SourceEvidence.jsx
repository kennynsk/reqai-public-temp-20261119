const STATUS_LABELS = { AVAILABLE: 'Доступен', NOT_PROVIDED: 'Не предоставлен', UNAVAILABLE: 'Недоступен' };
const technical = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{23,}|\b(?:chunk|unit|sha256|artifactId)\b/i;

export function CoverageWarning({ registry }) {
  const { materials = {}, scope = {} } = registry;
  if (!scope.partial && materials.primary?.status !== 'UNAVAILABLE' && materials.baseline?.status !== 'UNAVAILABLE' && !materials.references?.some((item) => item.status === 'UNAVAILABLE')) return null;
  return <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Часть материалов недоступна или обработана не полностью. Проверьте вопросы и охват в приложениях перед использованием требований.</p>;
}

export function SourceEvidence({ source, materials = {} }) {
  if (!source) return <span className="text-xs text-slate-500">Источник не указан</span>;
  const entries = [materials.primary, ...(materials.baseline?.artifacts || []), ...(materials.references || [])].filter(Boolean);
  const material = entries.find((item) => item.artifactId === source.artifactId);
  const name = material?.name && !technical.test(material.name) ? material.name : material?.role === 'baseline' ? 'Предыдущая версия' : material?.role === 'reference' ? 'Справочный материал' : 'Исходная бизнес-задача';
  const locator = source.locator === 'manual-review' ? 'Ручная формулировка' : source.locator === 'manual-research-review' ? 'AI-предложение после ручной проверки' : source.locator?.startsWith('research:') ? 'AI-предложение' : source.locator && !technical.test(source.locator) ? source.locator.replace(/^section:/i, 'Раздел ').replace(/^paragraph:/i, 'Абзац ').replace(/^page:/i, 'Страница ') : null;
  return <div className="text-xs text-slate-600 break-words"><span className="font-semibold">{name}</span>{locator && <span> · {locator}</span>}{source.quote ? <blockquote className="mt-2 border-l-2 border-indigo-200 pl-3 whitespace-pre-wrap">{source.quote}</blockquote> : <p className="mt-1 text-slate-500">Дословная цитата не приведена.</p>}</div>;
}

export function MaterialCoverage({ materials = {}, scope = {} }) {
  return <section className="rounded-xl bg-slate-50 p-4 text-sm space-y-2">
    <h3 className="font-bold text-slate-900">Материалы и охват</h3>
    <p>Основной материал: {STATUS_LABELS[materials.primary?.status] || 'Статус неизвестен'}</p>
    <p>Предыдущая версия: {STATUS_LABELS[materials.baseline?.status] || 'Не предоставлена'}</p>
    <p>Справочные материалы: {materials.references?.length || 0}</p>
    {(scope.partial || materials.primary?.status === 'UNAVAILABLE' || materials.baseline?.status === 'UNAVAILABLE' || materials.references?.some((item) => item.status === 'UNAVAILABLE')) && <p role="status" className="text-amber-800">Есть частично обработанные или недоступные материалы. Проверьте открытые вопросы.</p>}
    <p className="text-slate-600">Успешная обработка не подтверждает полноту требований. Сверьте реестр с исходной задачей.</p>
  </section>;
}
