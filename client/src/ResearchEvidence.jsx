import { useContext } from 'react';
import { DraftContext } from './review-context.js';
import { updateReviewMetadata } from './review-metadata.js';
import { safeCitationUrl, normalizeCitations } from '../../server/src/domain/research-evidence.js';
import { proposalWarnings } from './proposal-review.js';

export default function ResearchEvidence({ insight }) {
  const review = useContext(DraftContext);
  const citations = normalizeCitations(insight.citations);
  const checks = review.state.decisions.review?.citationChecks || {};
  const change = (key, patch) => review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { citationChecks: { ...checks, [key]: { checked: false, ...checks[key], ...patch } } }) });
  return <section aria-label="Доказательства и ограничения" className="text-xs text-slate-600 mt-3 space-y-2">
    <p>Применимость — оценка модели, не проверенная вероятность.</p>
    <p>Обоснование: {insight.rationale || 'Модель не предоставила отдельного обоснования оценки.'}</p>
    {proposalWarnings(`${insight.title}\n${insight.summary}`).map((warning) => <p key={warning} className="p-2 bg-amber-50 text-amber-900 rounded-lg">{warning}</p>)}
    <p>Категории источников не являются доказательствами.</p>
    {!citations.length && <p>Ссылки на источники не предоставлены.</p>}
    {citations.map((citation, index) => { const key = `${insight.id}:${index}`; const url = safeCitationUrl(citation.url); const check = checks[key] || {}; return <div key={key} className="p-3 border rounded-lg space-y-2">
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline break-all">{citation.title || 'Источник без названия'}</a> : <p>{citation.title || 'Источник без названия'} · Без безопасной ссылки</p>}
      {citation.publishedAt && <p>Дата из ответа модели: {citation.publishedAt}</p>}
      <p>{check.checked ? 'Проверено пользователем' : 'Не проверено'}{check.recordedAt ? ` · ${new Date(check.recordedAt).toLocaleString()}` : ''}</p>
      <label className="flex gap-2 items-start"><input type="checkbox" checked={check.checked === true} disabled={!url} onChange={(event) => change(key, { checked: event.target.checked, recordedAt: null, actorUserId: null })} />Я вручную проверил этот источник</label>
      <label className="block">Заметка проверки<input aria-label={`Заметка проверки источника ${index + 1}: ${insight.id}`} maxLength={5000} value={check.note || ''} onChange={(event) => change(key, { note: event.target.value, recordedAt: null, actorUserId: null })} className="block w-full border rounded-lg p-2 mt-1" /></label>
    </div>; })}
  </section>;
}
