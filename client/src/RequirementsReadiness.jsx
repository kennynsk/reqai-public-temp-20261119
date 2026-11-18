import { decompositionCoverage } from '../../server/src/services/decomposition-coverage.js';

export default function RequirementsReadiness({ registry, decisions, onQuestions, onLinks, coverage = decompositionCoverage(registry, decisions) }) {
  return <p aria-label="Полнота декомпозиции" className="mt-1 text-xs text-slate-600">
    <span>{coverage.incomplete ? 'Декомпозиция неполная' : 'Явных пробелов декомпозиции не выявлено'}</span>
    {coverage.openGaps.length > 0 && <> · <button type="button" onClick={onQuestions} className="font-semibold text-indigo-700 underline">Открытых вопросов: {coverage.openGaps.length}</button></>}
    {!coverage.openGaps.length && (coverage.breaks.length > 0 || coverage.unconfirmedLinks.length > 0) && <> · <button type="button" onClick={onLinks} className="font-semibold text-indigo-700 underline">Проверить связи</button></>}
  </p>;
}
