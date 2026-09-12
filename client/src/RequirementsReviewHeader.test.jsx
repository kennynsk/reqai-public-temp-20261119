// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RequirementsReviewHeader from './RequirementsReviewHeader.jsx';
import { RequirementsReviewContext } from './requirements-review-context.js';
import { BabokRegistryResult, DecompositionResult } from './AsyncJobWorkspace.jsx';
import { compactReviewFixture } from './requirements-review.fixture.js';

afterEach(cleanup);
const version = { versionId: 'v1', createdAt: '2026-09-10T08:19:00Z' };
function header(context = {}, props = {}) {
  return render(<RequirementsReviewContext.Provider value={context}><RequirementsReviewHeader version={version} onSave={vi.fn()} onResearch={vi.fn()} onFinal={vi.fn()} {...props} /></RequirementsReviewContext.Provider>);
}

test('completed child has one primary action and explicit repeat is secondary', () => {
  const open = vi.fn(), repeat = vi.fn();
  header({ childId: 'child', child: { status: 'SUCCEEDED', inputArtifactId: 'v1' }, onOpenResearch: open }, { onResearch: repeat });
  expect(screen.getByRole('button', { name: 'Посмотреть результаты AI' })).toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Перейти к финальной версии' })).not.toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Запустить AI-исследование повторно' }).closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть результаты AI' }));
  expect(open).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('Ещё'));
  fireEvent.click(screen.getByRole('button', { name: 'Запустить AI-исследование повторно' }));
  expect(repeat).toHaveBeenCalledOnce();
});

test('dirty changes disable downstream actions without falsely marking completeness', () => {
  header({}, { dirty: true });
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Перейти к финальной версии' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Улучшить требования с помощью AI' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Есть несохранённые изменения');
});

test('an active older child remains openable and blocks new launch and finalization', () => {
  header({ childId: 'child', child: { status: 'RUNNING', inputArtifactId: 'old' } });
  expect(screen.getByRole('button', { name: 'Открыть AI-исследование' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Перейти к финальной версии' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Улучшить требования с помощью AI' })).not.toBeInTheDocument();
  expect(screen.getByText(/Исследование предыдущей версии/)).toBeInTheDocument();
});

test('BABOK default shows nonempty types and can open a composer in an empty type', async () => {
  const registry = compactReviewFixture();
  render(<BabokRegistryResult value={registry} latestVersion={{ ...version, registry }} onSave={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Все типы' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /^Выбрать SR-001:/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Выбрать FR-/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Полнота:|Сверить полноту/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Перейти к финальной версии' })).toBeEnabled();
  fireEvent.click(screen.getAllByText('Добавить требование')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Функциональные требования', exact: true }));
  const input = await screen.findByRole('textbox', { name: 'Новое требование: FR' });
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: 'Система уведомляет сотрудника.' } });
  fireEvent.click(screen.getByRole('button', { name: /^BR ·/ }));
  fireEvent.click(screen.getByRole('button', { name: /^FR ·/ }));
  expect(screen.getByRole('textbox', { name: 'Новое требование: FR' })).toHaveValue('Система уведомляет сотрудника.');
});

test('legacy empty type is addable and pending drafts survive filtering and global save', async () => {
  const requirements = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] };
  const save = vi.fn();
  render(<DecompositionResult value={{ requirements }} latestVersion={{ ...version, requirements }} onSave={save} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'functional' } });
  fireEvent.click(within(screen.getByRole('region', { name: 'Функциональные требования' })).getByRole('button', { name: 'Добавить требование' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Новое требование: Функциональные требования' }), { target: { value: 'Отправить уведомление' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'business' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ requirements: expect.objectContaining({ functional: [expect.objectContaining({ text: 'Отправить уведомление' })] }) }));
});


test('a remote-version conflict prioritizes reconciliation without discarding local edits', () => {
  header({ conflict: true }, { dirty: true });
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).not.toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Перейти к финальной версии' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Есть несохранённые изменения');
});
