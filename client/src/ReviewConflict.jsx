import { presentReviewChanges } from './review-conflict.js';

export default function ReviewConflict({ preview, onClose, onApply }) {
  const changes = presentReviewChanges(preview.changes);
  const technical = preview.changes.filter((change) => change.operation === 'Решение проверки');
  return <>
    <h2 className="text-lg font-bold">Сравните правки с новой версией</h2>
    <p className="mt-2 text-sm text-slate-600">Перенос сохранит ваши формулировки и ответы поверх новой версии. Проверьте различия перед подтверждением.</p>
    {preview.transferredProposalCount > 0 && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">AI-правки и ответы будут перенесены в черновик. Подтверждения этих пакетов относятся к старой версии: проверьте требования заново перед закрытием вопросов. Исходные предложения останутся в истории обсуждения.</p>}
    {changes.map((change, index) => <article key={index} className="my-3 rounded-lg border border-slate-200 p-3"><h3 className="text-sm font-semibold">{change.id} · {change.operation}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">На сервере: {change.remote || 'Нет записи'}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">Моя правка: {change.local || 'Удалить'}</p></article>)}
    {technical.length > 0 && <details className="my-3 text-xs text-slate-500"><summary className="cursor-pointer">Технические подробности решений</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(technical, null, 2)}</pre></details>}
    <div className="mt-4 flex flex-wrap gap-3"><button onClick={onClose} className="rounded-lg border p-3">Остаться с черновиком</button><button onClick={() => onApply(true)} className="rounded-lg bg-indigo-600 p-3 text-white">Перенести мои правки</button><button onClick={() => onApply(false)} className="p-3 text-red-700">Отбросить мои правки и загрузить</button></div>
  </>;
}
