import { buildBabokTraceability } from '../../server/src/services/babok-report-renderer.js';
import ReviewQuestions from './ReviewQuestions.jsx';
import { MaterialCoverage, SourceEvidence } from './SourceEvidence.jsx';
import { RequirementPreviewContext, RequirementPreviewLink } from './RequirementPreview.jsx';
import { useContext } from 'react';
import { DraftContext } from './review-context.js';

export function RecordLinks({ ids = [], onNavigate, previewRequirementsOnly = false }) {
  const preview = useContext(RequirementPreviewContext);
  return <span className="inline-flex flex-wrap gap-2">{ids.map((id) => preview && (!previewRequirementsOnly || /^(BR|SR|FR|NFR|TR|CON)-/.test(id))
    ? <RequirementPreviewLink key={id} id={id} className="reqai-preview-link" />
    : <a key={id} href={`#record-${id}`} onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate(id); } }} className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 underline underline-offset-2">{id}</a>)} </span>;
}

function TraceabilityNode({ node, registry, onNavigate }) {
  const review = useContext(DraftContext);
  const { record, incoming, children } = node;
  const gaps = registry.analysis.GAP.filter((gap) => (gap.affectedIds.includes(record.id) || [...(record.relatedIds || []), ...(record.relatedTo || [])].includes(gap.id)) && review?.state.decisions.review?.gaps?.[gap.id]?.state !== 'closed');
  return <li className="min-w-0">
    <div className="py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <RecordLinks ids={[record.id]} onNavigate={onNavigate} />
        {incoming && <span className="text-xs text-slate-500">{incoming.relation}</span>}
        {incoming && incoming.status !== 'Подтверждено источником' && <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{incoming.status}</span>}
        {gaps.length > 0 && <span className="text-xs text-amber-900">{ /^(BR|SR)-/.test(record.id) ? 'Покрытие требует уточнения' : 'Есть пробелы' }</span>}
      </div>
      <p className="mt-1 break-words text-sm leading-6 text-slate-700">{record.text}</p>
      {node.hierarchyNote && <p className="mt-1 text-xs text-slate-500">{node.hierarchyNote}</p>}
    </div>
    {children.length > 0 && <ul className="ml-3 border-l border-slate-200 pl-3 sm:ml-5 sm:pl-5">{children.map((child) => <TraceabilityNode key={child.record.id} node={child} registry={registry} onNavigate={onNavigate} />)}</ul>}
  </li>;
}

function TraceabilityLinks({ registry, onNavigate }) {
  const { forest, supplemental, links } = buildBabokTraceability(registry);
  return <section aria-label="Связи требований" className="space-y-4">
    <h2 className="text-lg font-bold">Связи требований · {links.length}</h2>
    <p className="text-sm text-slate-600">Бизнес-результат → потребность роли → поведение и качество решения. Предположительные связи помечены; отдельные корни не означают вложенность.</p>
    {links.length === 0 && <p className="text-sm text-slate-600">Отдельная схема связей не сформирована. Связанные записи доступны на карточках требований.</p>}
    {forest.length > 0 && <ul aria-label="Иерархия требований" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">{forest.map((node) => <TraceabilityNode key={node.record.id} node={node} registry={registry} onNavigate={onNavigate} />)}</ul>}
    {supplemental.length > 0 && <section aria-label="Дополнительные связи" className="space-y-2">
      <h3 className="text-base font-semibold text-slate-900">Ограничения и дополнительные связи</h3>
      <p className="text-xs text-slate-600">Связи вне дерева и предположения для проверки. Ссылка без указанного типа связи не считается подтверждённой.</p>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-3 sm:px-4">{supplemental.map((link, index) => <li key={index} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
        <RecordLinks ids={[link.from]} onNavigate={onNavigate} />
        <span className="text-sm text-slate-600">{link.relation}</span>
        <RecordLinks ids={[link.to]} onNavigate={onNavigate} />
        <span className={`rounded px-2 py-1 text-xs ${link.status === 'Предполагается' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{link.status}</span>
      </li>)}</ul>
    </section>}
  </section>;
}

export default function RegistryAnalysis({ registry, section, onNavigate, onDiscuss, readOnly, onOpenQuestion }) {
  const analysis = registry.analysis;
  return <div className="space-y-4">
    {section === 'questions' && <ReviewQuestions onOpenQuestion={onOpenQuestion} registry={registry} onNavigate={onNavigate} onDiscuss={onDiscuss} readOnly={readOnly} />}
    {section === 'links' && <TraceabilityLinks registry={registry} onNavigate={onNavigate} />}
    {section === 'report' && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold text-sm p-1">Приложения: контекст, материалы и анализ</summary><div className="mt-4 space-y-4">
      {registry.summary?.conclusions?.length > 0 && <ul className="list-disc pl-5 text-sm">{registry.summary.conclusions.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      <MaterialCoverage materials={registry.materials} scope={registry.scope} />
      {[["Контекст", registry.context], ["Гипотезы", analysis.HYP], ["Термины", analysis.TERM], ["Сравнение с базовым набором", analysis.delta.filter((item) => item.kind !== 'дубликат')]].map(([label, items]) => <details key={label} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{label} · {items.length}</summary>{items.map((item) => <article id={`record-${item.id}`} tabIndex={-1} key={item.id} className="scroll-mt-20 border-t mt-3 pt-3"><p className="text-xs font-semibold">{item.id}</p><p className="text-sm my-2 whitespace-pre-wrap">{item.text || item.comment || `${item.term}: ${item.meaning || 'Требует уточнения'}`}</p><>{item.baselineId && <p className="text-xs text-slate-600">В базовом наборе: {item.baselineId}</p>}{item.kind && item.id.startsWith('DELTA-') && <p className="text-xs text-slate-600">{item.kind}</p>}<RecordLinks ids={item.relatedIds || item.affectedIds || [item.newId].filter(Boolean)} onNavigate={onNavigate} /></>{item.source && <SourceEvidence source={item.source} materials={registry.materials} />}</article>)}</details>)}
    </div></details>}
  </div>;
}
