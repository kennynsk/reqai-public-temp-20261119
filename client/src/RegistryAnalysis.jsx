import { buildBabokTraceability } from '../../server/src/services/babok-report-renderer.js';
import ReviewQuestions from './ReviewQuestions.jsx';
import { MaterialCoverage, SourceEvidence } from './SourceEvidence.jsx';
import { RequirementPreviewContext, RequirementPreviewLink } from './RequirementPreview.jsx';
import { useContext, useState } from 'react';
import { DraftContext } from './review-context.js';

export function RecordLinks({ ids = [], onNavigate, previewRequirementsOnly = false }) {
  const preview = useContext(RequirementPreviewContext);
  return <span className="inline-flex flex-wrap gap-2">{ids.map((id) => preview && (!previewRequirementsOnly || /^(BR|SR|FR|NFR|TR|CON)-/.test(id))
    ? <RequirementPreviewLink key={id} id={id} className="reqai-preview-link" />
    : <a key={id} href={`#record-${id}`} onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate(id); } }} className="inline-block rounded-sm bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 underline underline-offset-2">{id}</a>)} </span>;
}

function TraceabilityNode({ node, registry, onNavigate, showEvidence }) {
  const review = useContext(DraftContext);
  const { record, incoming, children } = node;
  const openGaps = registry.analysis.GAP.filter((gap) => {
    const related = gap.affectedIds.includes(record.id) || record.relatedIds?.includes(gap.id) || record.relatedTo?.includes(gap.id);
    const decision = review?.state.decisions.review?.gaps?.[gap.id];
    return related && (decision?.state !== 'closed' || decision.stale);
  });
  return <li className="min-w-0">
    <div className="py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <RecordLinks ids={[record.id]} onNavigate={onNavigate} />
        {openGaps.length > 0 && <details className="text-sm">
          <summary className="cursor-pointer text-amber-900">Открытые вопросы · {openGaps.length}</summary>
          <ul className="mt-1 space-y-1">{openGaps.map((gap) => <li key={gap.id}>
            <a href={`#record-${gap.id}`} className="text-indigo-700 underline" onClick={(event) => {
              if (onNavigate) { event.preventDefault(); onNavigate(gap.id); }
            }}>{registry.analysis.questions?.find((question) => question.gapId === gap.id)?.text || gap.text}</a>
          </li>)}</ul>
        </details>}
      </div>
      <p className="mt-1 break-words text-sm leading-6 text-slate-700">{record.text}</p>
      {showEvidence && incoming && <div className="mt-2 space-y-1 text-xs text-slate-600">
        <p>{incoming.from} → {record.id} · {incoming.relation} · {incoming.status}</p>
        <SourceEvidence source={incoming.source} materials={registry.materials} />
      </div>}
      {node.hierarchyNote && <p className="mt-1 text-xs text-slate-500">{node.hierarchyNote}</p>}
    </div>
    {children.length > 0 && <ul className="ml-3 border-l border-slate-200 pl-3 sm:ml-5 sm:pl-5">{children.map((child) => <TraceabilityNode key={child.record.id} node={child} registry={registry} onNavigate={onNavigate} showEvidence={showEvidence} />)}</ul>}
  </li>;
}

function TraceabilityLinks({ registry, onNavigate }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const { forest, outsideTree, links } = buildBabokTraceability(registry);
  return <section aria-label="Связи требований" className="space-y-4">
    <h2 className="text-lg font-bold">Связи требований · {links.length}</h2>
    {links.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <p>Бизнес-цель → потребность → требования к решению</p>
      <label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={showEvidence} onChange={(event) => setShowEvidence(event.target.checked)} />Показать основания связей</label>
    </div>}
    {links.length === 0 && <p className="text-sm text-slate-600">Отдельная схема связей не сформирована. Связанные записи доступны на карточках требований.</p>}
    {forest.length > 0 && <ul aria-label="Иерархия требований" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">{forest.map((node) => <TraceabilityNode key={node.record.id} node={node} registry={registry} onNavigate={onNavigate} showEvidence={showEvidence} />)}</ul>}
    {outsideTree.length > 0 && <section aria-label="Связи вне дерева" className="space-y-2">
      <h3 className="text-base font-semibold text-slate-900">Связи вне дерева · {outsideTree.length}</h3>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-3 sm:px-4">{outsideTree.map((link, index) => <li key={index} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
        <RecordLinks ids={[link.from]} onNavigate={onNavigate} />
        <span className="text-sm text-slate-600">{link.relation}</span>
        <RecordLinks ids={[link.to]} onNavigate={onNavigate} />
        {showEvidence && <div className="w-full space-y-1"><span className={`rounded-sm px-2 py-1 text-xs ${link.status === 'Предполагается' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{link.status}</span><SourceEvidence source={link.source} materials={registry.materials} /></div>}
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
