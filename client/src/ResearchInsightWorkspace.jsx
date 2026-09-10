import { useMemo, useState } from 'react';
import { ExternalLink, HelpCircle, Link2 } from 'lucide-react';
import { RequirementPreviewLink, RequirementPreviewProvider } from './RequirementPreview.jsx';
import { buildInsightPresentation, ensureSelectedInsightId, filterInsightPresentations } from './research-review.js';

function applicabilityLabel(value) {
  return value == null ? 'Оценка не указана' : `${value}%`;
}

function CategoryIcon({ meta, category, testId }) {
  const Icon = meta?.icon || HelpCircle;
  return <Icon data-testid={testId || `insight-category-icon-${category}`} aria-hidden="true" className="h-4 w-4 shrink-0" />;
}

function FilterButton({ option, active, onClick }) {
  return <button
    type="button"
    aria-pressed={active}
    aria-label={`${option.label} · ${option.count}`}
    onClick={onClick}
    className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? option.active : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
  >
    {option.icon && <option.icon aria-hidden="true" className="h-3.5 w-3.5" />}
    <span>{option.label} · {option.count}</span>
  </button>;
}

export default function ResearchInsightWorkspace({
  insights = [],
  categoryMeta,
  sourceTypeLabels = {},
  requirementIndex,
  getEnhancements,
  renderEvidence,
  renderEnhancement,
  selectedCount = 0,
  onSave,
  saveDisabled = false,
  saveLabel = 'Сохранить финальную версию',
}) {
  const presentations = useMemo(() => insights.map((insight, index) => buildInsightPresentation(insight, {
    categoryMeta,
    enhancements: getEnhancements(insight),
    fallbackId: `insight-${index + 1}`,
  })), [categoryMeta, getEnhancements, insights]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedInsightId, setSelectedInsightId] = useState(() => presentations[0]?.id || null);
  const visible = useMemo(() => filterInsightPresentations(presentations, activeFilter), [activeFilter, presentations]);
  const selectedId = ensureSelectedInsightId(selectedInsightId, visible);
  const selected = visible.find((insight) => insight.id === selectedId) || null;

  const filterOptions = useMemo(() => {
    const options = [{ key: 'all', label: 'Все результаты', count: presentations.length, active: 'border-indigo-600 bg-indigo-600 text-white', icon: null }];
    Object.entries(categoryMeta).forEach(([key, meta]) => {
      const count = presentations.filter((insight) => insight.categoryKey === key).length;
      if (count) options.push({ key, label: meta.label, count, active: meta.active, icon: meta.icon });
    });
    const unknownCount = presentations.filter((insight) => insight.categoryKey === 'unknown').length;
    if (unknownCount) options.push({ key: 'unknown', label: 'Другие результаты', count: unknownCount, active: 'border-slate-700 bg-slate-700 text-white', icon: HelpCircle });
    return options;
  }, [categoryMeta, presentations]);

  const selectFilter = (filter) => {
    const nextVisible = filterInsightPresentations(presentations, filter);
    setActiveFilter(filter);
    setSelectedInsightId((current) => ensureSelectedInsightId(current, nextVisible));
  };

  return <RequirementPreviewProvider index={requirementIndex}>
    <section aria-label="Результаты AI-исследования: список и детали" className="space-y-4">
      <div role="group" aria-label="Фильтры результатов AI-исследования" className="flex flex-wrap gap-2">
        {filterOptions.map((option) => <FilterButton key={option.key} option={option} active={activeFilter === option.key} onClick={() => selectFilter(option.key)} />)}
      </div>

      <div className="reqai-research-workspace grid min-w-0 gap-4 lg:grid-cols-[minmax(17.5rem,20rem)_minmax(0,1fr)]">
        <nav aria-label="Список результатов AI-исследования" className="reqai-research-selector min-w-0 rounded-2xl border border-slate-200 bg-white p-2">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Результаты</p>
            <span className="text-xs font-semibold text-slate-400">{visible.length} из {presentations.length}</span>
          </div>
          {visible.length ? <div role="listbox" aria-label="Выберите результат исследования" className="space-y-1">
            {visible.map((insight) => {
              const selectedRow = selected?.id === insight.id;
              return <button
                key={insight.id}
                type="button"
                role="option"
                aria-selected={selectedRow}
                aria-label={`${insight.title}. ${insight.categoryLabel}. ${applicabilityLabel(insight.applicability)}`}
                onClick={() => setSelectedInsightId(insight.id)}
                className={`w-full min-w-0 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selectedRow ? 'border-indigo-300 bg-indigo-50/70 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 rounded-lg p-1.5 ${insight.categoryMeta.color}`}><CategoryIcon meta={insight.categoryMeta} category={insight.category} testId={`insight-category-icon-${insight.category}`} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-xs font-semibold leading-4 text-slate-600">{insight.categoryLabel}</span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">{applicabilityLabel(insight.applicability)}</span>
                    </span>
                    <span className="reqai-title-clamp mt-1 text-sm font-semibold leading-5 text-slate-900">{insight.title}</span>
                  </span>
                </div>
              </button>;
            })}
          </div> : <p className="px-3 py-5 text-sm leading-relaxed text-slate-500">Нет результатов в выбранной категории.</p>}
        </nav>

        {selected ? <article aria-label={`Детали результата: ${selected.title}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${selected.categoryMeta.color}`}>
              <CategoryIcon meta={selected.categoryMeta} category={selected.category} />{selected.categoryLabel}
            </span>
            <span aria-label={selected.applicability == null ? 'Применимость: оценка не указана' : `Применимость: ${selected.applicability} процентов, оценка модели`} className="text-xs font-semibold text-slate-500">
              {applicabilityLabel(selected.applicability)} · оценка применимости
            </span>
          </div>
          <h2 className="reqai-research-copy mt-5 text-xl font-bold leading-tight text-slate-950 sm:text-2xl">{selected.title}</h2>
          {selected.summary && <p className="reqai-research-copy mt-3 text-base leading-7 text-slate-600">{selected.summary}</p>}
          {selected.detail && <div className="reqai-research-copy mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Подробности</p><p className="mt-2">{selected.detail}</p></div>}

          {selected.relatedTo.length > 0 && <div data-testid={`insight-relations-${selected.id}`} className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"><Link2 aria-hidden="true" className="h-3.5 w-3.5" />Затрагиваемые требования</p>
            <div className="flex flex-wrap gap-2">{selected.relatedTo.map((id) => <RequirementPreviewLink key={id} id={id} className="reqai-preview-link" />)}</div>
          </div>}

          {selected.sourceTypes.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2">
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            {selected.sourceTypes.map((source) => <span key={source} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{sourceTypeLabels[source] || source}</span>)}
          </div>}

          {renderEvidence && <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 group/evidence">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <span>Доказательства и ограничения</span><span aria-hidden="true" className="text-slate-400 group-open/evidence:rotate-180">⌄</span>
            </summary>
            <div className="border-t border-slate-200 px-4 pb-4">{renderEvidence(selected)}</div>
          </details>}

          {selected.enhancements.length === 0 && <p className="mt-5 border-t border-slate-100 pt-5 text-sm text-slate-500">В этом результате AI не предложил готовых требований для добавления в реестр.</p>}
          {selected.enhancements.length > 0 && <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
            <div><h3 className="text-base font-bold text-slate-900">Предлагаемые изменения</h3><p className="mt-1 text-sm text-slate-500">Проверьте формулировки перед добавлением в черновик требований.</p></div>
            {selected.enhancements.map((enhancement, index) => renderEnhancement(enhancement, selected, index))}
          </div>}
        </article> : <article aria-label="Пустой результат фильтра" className="flex min-h-64 min-w-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <div><p className="font-semibold text-slate-800">Нет результатов в выбранной категории</p><p className="mt-1 text-sm text-slate-500">Выберите другой фильтр, чтобы продолжить проверку.</p></div>
        </article>}
      </div>

      <div className="reqai-research-save flex items-center justify-between gap-4 border-t border-slate-200 pt-4 flex-wrap">
        <p className="font-semibold text-slate-900">Выбрано улучшений: {selectedCount}</p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><button type="button" disabled={saveDisabled} onClick={onSave} className="w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto">{saveLabel}</button></div>
      </div>
    </section>
  </RequirementPreviewProvider>;
}
