// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ResearchEvidence from './ResearchEvidence.jsx';
import { DraftContext } from './review-context.js';

afterEach(cleanup);

function renderEvidence({ insight = {}, citationChecks = {} } = {}) {
  const dispatch = vi.fn();
  const value = {
    state: { decisions: { review: { citationChecks } } },
    dispatch,
  };
  const result = render(
    <DraftContext.Provider value={value}>
      <ResearchEvidence insight={{
        id: 'insight-1',
        title: 'Уточнение процессов',
        summary: 'Проверить критерии приемки.',
        ...insight,
      }} />
    </DraftContext.Provider>,
  );
  return { ...result, dispatch };
}

test('explains missing rationale and citations and surfaces proposal warnings', () => {
  renderEvidence({ insight: { rationale: '', citations: [], title: 'Предложить уточнить каналы协作' } });

  expect(screen.getByText(/Обоснование: Модель не предоставила отдельного обоснования оценки\./)).toBeInTheDocument();
  expect(screen.getByText('Ссылки на источники не предоставлены.')).toBeInTheDocument();
  expect(screen.getByText('В тексте есть фрагмент на другом языке. Проверьте формулировку.')).toBeInTheDocument();
  expect(screen.getByText('Это может быть инструкция аналитику, а не проверяемое требование.')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('renders safe and unsafe citations and records manual checks and notes', () => {
  const { dispatch } = renderEvidence({
    insight: {
      rationale: 'Сопоставлено с практикой отрасли.',
      citations: [
        { title: 'Отчёт отрасли', url: 'https://example.org/report', publishedAt: '2026-01-15' },
        { title: 'Небезопасный источник', url: 'javascript:alert(1)', publishedAt: '2026-01-16' },
      ],
    },
    citationChecks: {
      'insight-1:0': { checked: true, recordedAt: '2026-01-15T10:00:00.000Z', note: 'Сверено вручную' },
    },
  });

  expect(screen.getByRole('link', { name: 'Отчёт отрасли' })).toHaveAttribute('href', 'https://example.org/report');
  expect(screen.getByText('Дата из ответа модели: 2026-01-15')).toBeInTheDocument();
  expect(screen.getByText(/Проверено пользователем/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('Сверено вручную')).toBeInTheDocument();
  expect(screen.getByText('Небезопасный источник · Без безопасной ссылки')).toBeInTheDocument();
  expect(screen.getAllByRole('checkbox')[1]).toBeDisabled();

  const checked = screen.getAllByRole('checkbox')[0];
  fireEvent.click(checked);
  expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'decisions' }));
  expect(dispatch.mock.lastCall[0].value.review.citationChecks['insight-1:0']).toMatchObject({
    checked: false,
    recordedAt: null,
    actorUserId: null,
  });

  fireEvent.change(screen.getByRole('textbox', { name: 'Заметка проверки источника 1: insight-1' }), { target: { value: 'Проверено повторно' } });
  expect(dispatch.mock.lastCall[0].value.review.citationChecks['insight-1:0']).toMatchObject({ note: 'Проверено повторно', checked: true });
});

test('uses a safe fallback title for both linkable and unsafe citations', () => {
  renderEvidence({ insight: { citations: [{ url: 'https://example.org/no-title' }, { url: 'javascript:alert(1)' }] } });

  expect(screen.getByRole('link', { name: 'Источник без названия' })).toHaveAttribute('href', 'https://example.org/no-title');
  expect(screen.getByText('Источник без названия · Без безопасной ссылки')).toBeInTheDocument();
});
