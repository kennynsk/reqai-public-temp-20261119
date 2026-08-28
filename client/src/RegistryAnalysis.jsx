import { MaterialCoverage, SourceEvidence } from './SourceEvidence.jsx';

export function RecordLinks({ ids = [], onNavigate }) {
  return <span className="inline-flex flex-wrap gap-2">{ids.map((id) => <a key={id} href={`#record-${id}`} onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate(id); } }} className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 underline underline-offset-2">{id}</a>)}</span>;
}

export default function RegistryAnalysis({ registry, section, onNavigate }) {
  const analysis = registry.analysis;
  return <div className="space-y-4">
    {section === 'questions' && <section aria-label="Вопросы для уточнения" className="space-y-3">
      <h2 className="text-lg font-bold">Вопросы для уточнения · {analysis.GAP.length}</h2>
      <p className="text-sm text-slate-600">Это пробелы исходных данных, а не подтверждённые требования.</p>
      {analysis.GAP.map((gap) => <article id={`record-${gap.id}`} tabIndex={-1} key={gap.id} className="scroll-mt-56 rounded-xl border border-amber-200 bg-white p-4"><h3 className="font-semibold">{gap.id} · {gap.text}</h3><div className="mt-2"><RecordLinks ids={gap.affectedIds} onNavigate={onNavigate} /></div>{gap.nextStep && <p className="my-2 text-sm">Следующий шаг: {gap.nextStep}</p>}{analysis.questions.filter((question) => question.gapId === gap.id).map((question) => <div key={question.id} className="my-3 rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-900">{({ P0: 'Критический', P1: 'Высокий', P2: 'Обычный' })[question.priority] || 'Приоритет не указан'} · {question.addressee}</p><p className="mt-1 text-sm">{question.text}</p></div>)}<details className="text-sm"><summary className="cursor-pointer p-2">Источник вопроса</summary><SourceEvidence source={gap.source} materials={registry.materials} /></details></article>)}
      {!analysis.GAP.length && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">AI не сформировал вопросов. Это не заменяет ручную проверку полноты.</p>}
    </section>}
    {section === 'links' && <section aria-label="Связи требований" className="space-y-3"><h2 className="text-lg font-bold">Связи требований · {analysis.traceability.length}</h2>{analysis.traceability.map((link, index) => <article key={index} className="rounded-xl border bg-white p-4"><RecordLinks ids={[link.from, link.to]} onNavigate={onNavigate} /><p className="text-sm mt-2">{link.relation}</p><p className="text-xs text-slate-600 mt-1">{link.status}</p></article>)}{!analysis.traceability.length && <p className="text-sm text-slate-600">Отдельная схема связей не сформирована. Связанные записи доступны на карточках требований.</p>}</section>}
    <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold text-sm p-1">Приложения: контекст, материалы и анализ</summary><div className="mt-4 space-y-4">
      {registry.summary?.text && <p className="text-sm whitespace-pre-wrap">{registry.summary.text}</p>}
      {registry.summary?.conclusions?.length > 0 && <ul className="list-disc pl-5 text-sm">{registry.summary.conclusions.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      <MaterialCoverage materials={registry.materials} scope={registry.scope} />
      {[["Контекст", registry.context], ["Гипотезы", analysis.HYP], ["Термины", analysis.TERM], ["Изменения относительно предыдущей версии", analysis.delta]].map(([label, items]) => <details key={label} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{label} · {items.length}</summary>{items.map((item) => <article id={`record-${item.id}`} tabIndex={-1} key={item.id} className="scroll-mt-56 border-t mt-3 pt-3"><p className="text-xs font-semibold">{item.id}</p><p className="text-sm my-2 whitespace-pre-wrap">{item.text || item.comment || `${item.term}: ${item.meaning || 'Требует уточнения'}`}</p><RecordLinks ids={item.relatedIds || item.affectedIds || [item.baselineId, item.newId].filter(Boolean)} onNavigate={onNavigate} />{item.source && <SourceEvidence source={item.source} materials={registry.materials} />}</article>)}</details>)}
    </div></details>
  </div>;
}
