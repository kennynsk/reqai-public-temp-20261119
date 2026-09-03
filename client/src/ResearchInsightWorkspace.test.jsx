// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ResearchInsightWorkspace from './ResearchInsightWorkspace.jsx';

afterEach(cleanup);

const categoryMeta = {
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
  expect(screen.getByRole('option', { name: /Конфликт бронирований/ })).toHaveAttribute('aria-selected', 'true');
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

  expect(screen.getByRole('article', { name: 'Пустой результат фильтра' })).toHaveTextContent('Нет результатов в выбранной категории');
});
