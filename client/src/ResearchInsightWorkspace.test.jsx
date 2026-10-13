// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ResearchInsightWorkspace from './ResearchInsightWorkspace.jsx';

afterEach(cleanup);

const categoryMeta = {
  trends: { label: 'Тренды рынка', color: '', active: '' },
  competitors: { label: 'Конкурентный анализ', color: '', active: '' },
  standards: { label: 'Стандарты и нормативы', color: '', active: '' },
  patterns: {
    label: 'Паттерны',
    color: 'bg-indigo-100 text-indigo-700',
    active: 'border-indigo-600 bg-indigo-600 text-white',
  },
  risks: {
    label: 'Риски',
    color: 'bg-rose-100 text-rose-700',
    active: 'border-rose-600 bg-rose-600 text-white',
  },
};

test('all research directions remain visible when a historical run has no results for a category', () => {
  renderWorkspace([{ id: 'risk-1', category: 'risks', title: 'Риск', summary: 'Описание', enhancements: [], evidenceMode: 'MODEL_HYPOTHESIS' }]);
  for (const label of ['Тренды рынка', 'Конкурентный анализ', 'Стандарты и нормативы']) {
    expect(screen.getByRole('button', { name: `${label} · 0` })).toBeVisible();
  }
  expect(screen.getAllByRole('note').some((note) => note.textContent.includes('знаниям LLM'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Конкурентный анализ · 0' }));
  expect(screen.getByRole('article', { name: 'Пустой результат фильтра' })).toBeVisible();
});

function renderWorkspace(insights) {
  return render(<ResearchInsightWorkspace
    insights={insights}
    categoryMeta={categoryMeta}
    getEnhancements={(insight) => insight.enhancements}
    renderEnhancement={(enhancement) => <p key={enhancement.key}>{enhancement.text}</p>}
    selectedCount={1}
    onSave={() => {}}
  />);
}

test('keeps the selected result detail complete while filtering the split view', () => {
  const insights = [
    {
      id: 'pattern-1',
      category: 'patterns',
      title: 'Бронирование с подтверждением',
      summary: 'Пользователь получает подтверждение после выбора комнаты.',
      detail: 'Подробное описание паттерна.',
      applicability: 85,
      relatedTo: ['BR-001'],
      source_types: ['open_standard'],
      enhancements: [{ key: 'pattern-1:0', text: 'Добавить подтверждение' }],
    },
    {
      id: 'risk-1',
      category: 'risks',
      title: 'Конфликт бронирований',
      summary: 'Проверить одновременный выбор одной комнаты.',
      applicability: 65,
      enhancements: [],
    },
  ];

  renderWorkspace(insights);

  expect(screen.getByRole('heading', { name: 'Бронирование с подтверждением' })).toBeInTheDocument();
  expect(screen.getByText('85% · оценка применимости')).toBeInTheDocument();
  expect(screen.getByText('Подробное описание паттерна.')).toBeInTheDocument();
  expect(screen.getByText('Добавить подтверждение')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Риски · 1' }));

  expect(screen.getByRole('heading', { name: 'Конфликт бронирований' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Конфликт бронирований/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('heading', { name: 'Бронирование с подтверждением' })).not.toBeInTheDocument();
});

test('shows the empty state when the active filter no longer has results', () => {
  const insights = [
    { id: 'pattern-1', category: 'patterns', title: 'Паттерн', summary: 'Описание', enhancements: [] },
    { id: 'risk-1', category: 'risks', title: 'Риск', summary: 'Описание', enhancements: [] },
  ];
  const { rerender } = renderWorkspace(insights);

  fireEvent.click(screen.getByRole('button', { name: 'Риски · 1' }));
  rerender(<ResearchInsightWorkspace
    insights={[insights[0]]}
    categoryMeta={categoryMeta}
    getEnhancements={(insight) => insight.enhancements}
    renderEnhancement={(enhancement) => <p key={enhancement.key}>{enhancement.text}</p>}
    selectedCount={0}
    onSave={() => {}}
  />);

  expect(screen.getByRole('article', { name: 'Пустой результат фильтра' })).toHaveTextContent('Нет результатов по выбранным фильтрам');
});

test('unverified evidence is visible before disclosure and decisions can be filtered', () => {
  render(<ResearchInsightWorkspace insights={[{ id: 'i1', title: 'Документы', category: 'patterns', applicability: 90, enhancements: [{ key: 'i1:0', text: 'Хранить' }, { key: 'i1:1', text: 'Удалять' }] }]} categoryMeta={categoryMeta} getEnhancements={(item) => item.enhancements} decisions={{ 'i1:0': 'accepted', 'i1:1': 'rejected' }} renderEnhancement={(item) => <p key={item.key}>{item.text}</p>} />);
  expect(screen.getByRole('note')).toHaveTextContent('ссылки на источники не предоставлены');
  fireEvent.change(screen.getByRole('combobox', { name: /Решение по предложению/ }), { target: { value: 'rejected' } });
  expect(screen.getByText('Удалять')).toBeVisible();
  expect(screen.queryByText('Хранить')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: /Решение по предложению/ }), { target: { value: 'pending' } });
  expect(screen.getByRole('article', { name: 'Пустой результат фильтра' })).toBeVisible();
});
