import { useContext, useState } from 'react';
import { DraftContext } from './review-context.js';
import ReviewDialog from './ReviewDialog.jsx';
import { STRUCTURED_FIELDS } from './review-fields.js';
import { applyProposal, reverseProposal, proposalRecord, proposalWarnings } from './proposal-review.js';

export default function ProposalReview({ enhancement, decision, children }) {
  const review = useContext(DraftContext);
  const [plan, setPlan] = useState(null);
  const [reversing, setReversing] = useState(false);
  const [error, setError] = useState('');
  const groups = review.content.groups || review.content;
  const prior = review.state.decisions.review?.proposals?.[enhancement.key];
  const current = Object.values(groups).flat().find((record) => record.researchEnhancementKey === enhancement.key);
  const open = (nextDecision) => {
    setError('');
    if (nextDecision === 'rejected') {
      if (current) setReversing(true);
      else review.dispatch({ type: 'restore', value: reverseProposal(review.state, enhancement.key, true) });
      return;
    }
    setPlan({ operation: prior?.operation || 'add', targetType: prior?.targetType || enhancement.targetType, targetId: prior?.operation === 'replace' ? prior.targetId : '', text: current?.text || prior?.after?.text || enhancement.text, fields: current || prior?.after || enhancement });
  };
  const target = plan?.operation === 'replace' ? groups[plan.targetType]?.find((record) => record.id === plan.targetId) : current;
  const after = plan ? proposalRecord(review.content, plan.targetType, target?.id || 'новый ID', plan.text, plan.fields, enhancement.key, target) : null;
  const diff = plan ? ['text', ...(STRUCTURED_FIELDS[plan.targetType] || []).map(([field]) => field)].map((field) => ({ field, label: field === 'text' ? 'Формулировка' : STRUCTURED_FIELDS[plan.targetType].find(([key]) => key === field)[1], before: target?.[field], after: after[field] })) : [];
  const invalid = plan && (!plan.text.trim() || plan.operation === 'replace' && !target || (STRUCTURED_FIELDS[plan.targetType] || []).some(([field, , required]) => required && !plan.fields[field]?.trim()));
  return <>
    {children(open, prior?.after || enhancement, decision)}
    {plan && <ReviewDialog label="Проверить AI-предложение" onClose={() => setPlan(null)}>
      <h2 className="text-lg font-bold">Проверить точное изменение</h2>
      <p className="text-sm text-slate-600 mt-2">Связанные требования не заменяются автоматически. Подтверждение добавляет изменение в черновик; затем сохраните версию.</p>
      <section className="my-3 border rounded-lg p-3"><h3 className="text-sm font-semibold">Исходное предложение AI</h3><p className="text-sm whitespace-pre-wrap mt-1">{enhancement.text}</p><p className="text-sm mt-2">Обоснование: {enhancement.rationale || 'Не предоставлено моделью.'}</p><p className="text-xs mt-2">Связи: {(enhancement.targetIds || enhancement.relatedTo || []).join(', ') || 'Не указаны'}</p></section>
      {proposalWarnings(`${enhancement.insightTitle || ''}\n${enhancement.text}`).map((warning) => <p key={warning} role="note" className="text-sm bg-amber-50 text-amber-900 p-3 rounded-lg my-2">{warning}</p>)}
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Действие<select aria-label="Действие предложения" value={plan.operation} disabled={Boolean(current)} onChange={(event) => setPlan({ ...plan, operation: event.target.value, targetId: '' })} className="block w-full border rounded-lg p-3"><option value="add">Добавить требование</option><option value="replace">Заменить выбранное требование</option></select></label><label className="text-sm">Тип требования<select aria-label="Тип предложения" value={plan.targetType} disabled={Boolean(current)} onChange={(event) => setPlan({ ...plan, targetType: event.target.value, targetId: '', fields: {} })} className="block w-full border rounded-lg p-3">{Object.keys(groups).map((type) => <option key={type}>{type}</option>)}</select></label></div>
      {plan.operation === 'replace' && <label className="block text-sm my-3">Какое требование заменить<select aria-label="Цель замены" value={plan.targetId} disabled={Boolean(current)} onChange={(event) => { const record = groups[plan.targetType].find((item) => item.id === event.target.value); setPlan({ ...plan, targetId: event.target.value, fields: record || {} }); }} className="block w-full border rounded-lg p-3"><option value="">Выберите требование</option>{groups[plan.targetType].map((record) => <option key={record.id} value={record.id}>{record.id} · {record.text}</option>)}</select></label>}
      <label className="block text-sm my-3">Итоговая формулировка<textarea aria-label="Итоговая формулировка" value={plan.text} maxLength={20000} rows={4} onChange={(event) => setPlan({ ...plan, text: event.target.value })} className="block w-full border rounded-lg p-3 mt-1" /></label>
      {(STRUCTURED_FIELDS[plan.targetType] || []).map(([field, label, required]) => <label key={field} className="block text-sm my-3">{label}{required ? ' *' : ''}<input aria-label={label} maxLength={5000} value={plan.fields[field] || ''} onChange={(event) => setPlan({ ...plan, fields: { ...plan.fields, [field]: event.target.value } })} className="block w-full border rounded-lg p-3 mt-1" /></label>)}
      <div className="overflow-x-auto"><table className="w-full text-sm border-collapse"><caption className="text-left font-semibold my-2">Точное изменение · {plan.operation === 'replace' ? 'замена' : 'добавление'}</caption><thead><tr><th className="text-left p-2">Поле</th><th className="text-left p-2">Было</th><th className="text-left p-2">Станет</th></tr></thead><tbody>{diff.map((entry) => <tr key={entry.field} className="border-t"><th className="text-left p-2 font-normal">{entry.label}</th><td className="p-2 whitespace-pre-wrap break-words">{entry.before || '—'}</td><td className="p-2 whitespace-pre-wrap break-words">{entry.after || '—'}</td></tr>)}</tbody></table></div>
      {error && <p role="alert" className="text-red-700 my-2">{error}</p>}
      <div className="flex gap-2 mt-4 flex-wrap"><button onClick={() => setPlan(null)} className="p-3 border rounded-lg">Отмена</button><button disabled={invalid} onClick={() => { try { review.dispatch({ type: 'restore', value: applyProposal(review.state, enhancement, plan) }); setPlan(null); } catch (cause) { setError(cause.message); } }} className="p-3 rounded-lg bg-indigo-600 text-white disabled:bg-slate-400">Принять точное изменение</button></div>
    </ReviewDialog>}
    {reversing && <ReviewDialog label="Отменить принятие предложения" onClose={() => setReversing(false)}><h2 className="font-bold text-lg">Что сделать с принятым требованием?</h2><p className="text-sm my-3">{current.id}: {current.text}</p><p className="text-sm my-3">{prior?.before ? `При отмене восстановится: ${prior.before.text}` : 'При отмене требование и ссылки на него будут удалены из черновика.'} Ручные доработки сохранятся только при выборе «Оставить».</p><div className="flex gap-2 flex-wrap">{[[true, 'Оставить как ручное требование'], [false, prior?.before ? 'Восстановить прежнее требование' : 'Удалить принятое требование']].map(([retain, label]) => <button key={label} className="p-3 rounded-lg border" onClick={() => { review.dispatch({ type: 'restore', value: reverseProposal(review.state, enhancement.key, retain) }); setReversing(false); }}>{label}</button>)}<button className="p-3 rounded-lg border" onClick={() => setReversing(false)}>Не менять решение</button></div></ReviewDialog>}
  </>;
}
