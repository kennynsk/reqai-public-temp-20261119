import { useContext } from 'react';
import { DraftContext } from './review-context.js';
import { STRUCTURED_FIELDS } from './review-fields.js';
import { researchProposalAction, researchProposalFields } from './research-proposal-action.js';

export default function ProposalChangePreview({ enhancement }) {
  const review = useContext(DraftContext);
  const { operation, targetType, before, prior } = researchProposalAction(enhancement, review);
  const after = prior?.decision === 'accepted' ? prior.after : { ...researchProposalFields(enhancement, before), text: enhancement.text };
  if (operation !== 'replace') return <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{after?.text || enhancement.text}</p>;
  if (!before) return <p className="mt-3 text-sm text-slate-600">Исходное требование недоступно. Выберите цель при проверке предложения.</p>;
  const changes = [['text', 'Формулировка'], ...(STRUCTURED_FIELDS[targetType] || [])].filter(([field]) => (before[field] ?? '') !== (after?.[field] ?? ''));
  if (!changes.length) return <p className="mt-3 text-sm text-slate-600">Предложение совпадает с текущим требованием. Изменений нет.</p>;
  return <div className="mt-3 space-y-4 text-sm leading-relaxed">
    {changes.map(([field, label]) => <section key={field} aria-label={`Изменение: ${label}`}>
      <h4 className="font-semibold text-slate-900">{label}</h4>
      <dl className="mt-2 space-y-3">
        <div><dt className="font-semibold text-slate-600">Было</dt><dd className="mt-1 whitespace-pre-line break-words text-slate-700">{before[field] || 'Не задано'}</dd></div>
        <div><dt className="font-semibold text-slate-600">Стало</dt><dd className="mt-1 whitespace-pre-line break-words text-slate-900">{after[field] || 'Не задано'}</dd></div>
      </dl>
    </section>)}
  </div>;
}
