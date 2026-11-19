import { presentSource } from './source-presentation.js';

const STATUS_LABELS = { AVAILABLE: 'Доступен', NOT_PROVIDED: 'Не предоставлен', UNAVAILABLE: 'Недоступен' };

export function CoverageWarning({ registry }) {
  const { materials = {}, scope = {} } = registry;
  if (!scope.partial && materials.primary?.status !== 'UNAVAILABLE' && materials.baseline?.status !== 'UNAVAILABLE' && !materials.references?.some((item) => item.status === 'UNAVAILABLE')) return null;
  return <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Часть материалов недоступна или обработана не полностью. Проверьте вопросы и охват в приложениях перед использованием требований.</p>;
}

export function SourceEvidence({ source, materials = {} }) {
  if (!source) return <span className="text-xs text-slate-500">Источник не указан</span>;
  const { label: name, locator } = presentSource(source, materials);
  return <div className="text-xs text-slate-600 break-words"><span className="font-semibold">{name}</span>{locator && <span> · {locator}</span>}{source.quote ? <blockquote className="mt-2 border-l-2 border-indigo-200 pl-3 whitespace-pre-wrap">{source.quote}</blockquote> : <p className="mt-1 text-slate-500">Дословная цитата не приведена.</p>}</div>;
}

export function MaterialCoverage({ materials = {}, scope = {} }) {
  return <section className="rounded-xl bg-slate-50 p-4 text-sm space-y-2">
    <h3 className="font-bold text-slate-900">Материалы и охват</h3>
    <p>Основной материал: {STATUS_LABELS[materials.primary?.status] || 'Статус неизвестен'}</p>
    <p>Предыдущая версия: {STATUS_LABELS[materials.baseline?.status] || 'Не предоставлена'}</p>
    <p>Справочные материалы: {materials.references?.length || 0}</p>
    {(scope.partial || materials.primary?.status === 'UNAVAILABLE' || materials.baseline?.status === 'UNAVAILABLE' || materials.references?.some((item) => item.status === 'UNAVAILABLE')) && <p role="status" className="text-amber-800">Есть частично обработанные или недоступные материалы. Проверьте открытые вопросы.</p>}
  </section>;
}
