import { useContext } from 'react';
import { DraftContext } from './review-context.js';
import { researchProposalAction } from './research-proposal-action.js';

export default function ProposalChangePreview({ enhancement }) {
  const review = useContext(DraftContext);
  const { operation, before, prior } = researchProposalAction(enhancement, review);
  const text = prior?.decision === 'accepted' ? prior.after?.text || enhancement.text : enhancement.text;
  if (operation !== 'replace') return <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{text}</p>;
  return <dl className="mt-3 space-y-3 text-sm leading-relaxed">
    <div><dt className="font-semibold text-slate-600">Было</dt><dd className="mt-1 whitespace-pre-line break-words text-slate-700">{before?.text || 'Исходное требование недоступно. Выберите цель при проверке предложения.'}</dd></div>
    <div><dt className="font-semibold text-slate-600">Стало</dt><dd className="mt-1 whitespace-pre-line break-words text-slate-900">{text}</dd></div>
  </dl>;
}
