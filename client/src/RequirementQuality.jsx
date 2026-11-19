import { useContext } from 'react';
import { DraftContext } from './review-context.js';
import { requirementGaps } from './review-metadata.js';

const qualityFields = {
  BR: [['successIndicator', 'критерий успеха']],
  SR: [['role', 'роль заинтересованной стороны']],
  NFR: [['category', 'категория'], ['scope', 'область действия'], ['verificationMethod', 'способ проверки']],
  TR: [['completionCriterion', 'критерий завершения перехода']],
  CON: [['obligation', 'обязательство']],
};

export default function RequirementQuality({ type, requirement, readOnly, onReview, onShowQuestions }) {
  const review = useContext(DraftContext);
  const metadata = review?.state.decisions.review || {};
  const gaps = requirementGaps(review?.content, requirement);
  const open = gaps.filter((gap) => metadata.gaps?.[gap.id]?.state !== 'closed');
  const missing = (qualityFields[type] || []).filter(([field]) => !requirement[field]?.trim()).map(([, label]) => label);
  const ready = requirement.quality === 'Готово';
  if (ready && !open.length && !missing.length) return null;

  const summary = ready
    ? 'Формулировка отмечена как готовая. Связанные вопросы и полноту полей нужно проверить отдельно.'
    : requirement.quality === 'Требует уточнения'
      ? open.length ? 'Основания уточнения и проверка ответов — в блоке связанных вопросов ниже.'
        : gaps.length ? 'Все связанные вопросы закрыты, но требование по-прежнему отмечено как требующее уточнения. Проверьте формулировку и оценку качества.'
          : 'Требование отмечено как требующее уточнения, но связанная причина не указана. Проверьте формулировку и зафиксируйте недостающие сведения.'
      : requirement.quality === 'Конфликтует'
        ? 'Требование отмечено как конфликтующее. Проверьте противоречия со связанными требованиями и зафиксируйте согласованную формулировку.'
        : requirement.quality === 'Не тестируемо'
          ? 'Требование отмечено как непроверяемое. Уточните условия и результат, по которым можно проверить его выполнение.'
          : 'Оценка качества не определена. Проверьте формулировку и выберите оценку.';

  return <section aria-label={`Основания оценки качества ${requirement.id}`} className="mt-3 space-y-2 text-sm text-slate-600">
    <p>{summary}</p>
    {missing.length > 0 && <p><span className="font-semibold text-slate-700">Не заполнено:</span> {missing.join(', ')}. {readOnly ? 'Уточните эти сведения в редактируемой версии требований.' : 'Уточните эти сведения в редакторе требования.'}</p>}
    {(open.length > 0 && onShowQuestions || !readOnly && onReview) && <div className="flex flex-wrap gap-x-4 gap-y-1">
      {open.length > 0 && onShowQuestions && <button type="button" onClick={onShowQuestions} className="min-h-9 rounded-sm px-1 py-2 text-sm font-semibold text-indigo-700 underline underline-offset-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500">Показать связанные вопросы</button>}
    {!readOnly && onReview && <button type="button" onClick={onReview} className="min-h-9 rounded-sm px-1 py-2 text-sm font-semibold text-indigo-700 underline underline-offset-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500">Проверить формулировку и оценку</button>}
    </div>}
    {!ready && <p className="text-xs text-slate-500">{readOnly ? 'Здесь показана оценка сохранённой формулировки. Пересмотреть её можно в редактируемой версии требований.' : 'После проверки выберите оценку качества в редакторе. Закрытие вопросов само по себе её не меняет.'}</p>}
  </section>;
}
