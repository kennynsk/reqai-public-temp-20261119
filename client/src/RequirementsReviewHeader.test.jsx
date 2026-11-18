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
  expect(screen.getByRole('button', { name: 'Посмотреть предложения AI' })).toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).not.toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Запустить AI-исследование повторно' }).closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть предложения AI' }));
  expect(open).toHaveBeenCalledOnce();
  screen.getByRole('button', { name: 'Ещё ▾' }).parentElement.open = true;
  fireEvent.click(screen.getByRole('button', { name: 'Запустить AI-исследование повторно' }));
  expect(repeat).toHaveBeenCalledOnce();
});

test('dirty changes keep downstream actions enabled and route them through save', async () => {
  const save = vi.fn(() => Promise.resolve({ versionId: 'v2', createdAt: version.createdAt }));
  const repeat = vi.fn(), finalize = vi.fn();
  header({ childId: 'child', child: { status: 'SUCCEEDED', inputArtifactId: 'v1' } }, { dirty: true, onSave: save, onResearch: repeat, onFinal: finalize });
  const saveButton = screen.getByRole('button', { name: 'Сохранить изменения' });
  expect(saveButton).toHaveClass('bg-indigo-600');
  const finalizeButton = screen.getByRole('button', { name: 'Создать финальную версию' });
  expect(finalizeButton).toBeEnabled();
  fireEvent.click(finalizeButton);
  expect(finalize).toHaveBeenCalledOnce();
  screen.getByRole('button', { name: 'Ещё ▾' }).parentElement.open = true;
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и запустить AI-исследование' }));
  await waitFor(() => expect(repeat).toHaveBeenCalledWith('v2'));
  expect(save).toHaveBeenCalledOnce();
});

test('first review prioritizes saving and blocks research if saving fails', async () => {
  const save = vi.fn().mockResolvedValue(null);
  const research = vi.fn();
  header({}, { version: null, onSave: save, onResearch: research });
  expect(screen.getByRole('status')).toHaveTextContent('Рабочая версия ещё не сохранена');
  expect(screen.getByRole('button', { name: 'Сохранить рабочую версию' })).toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).toHaveClass('border-slate-300');
  const disclosure = screen.getByRole('button', { name: 'Ещё ▾' }).parentElement;
  disclosure.open = true;
  expect(screen.queryByRole('button', { name: 'Скачать DOCX' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить и запустить AI-исследование' }));
  await save.mock.results[0].value;
  expect(research).not.toHaveBeenCalled();
  expect(disclosure).not.toHaveAttribute('open');
});

test('a clean saved version shows a saved chip with timestamp and final as primary', () => {
  header({});
  expect(screen.getByText(/Рабочая версия сохранена · /)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Сохранить/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).toBeEnabled();
});

test('an active older child remains openable and blocks new launch and finalization', () => {
  header({ childId: 'child', child: { status: 'RUNNING', inputArtifactId: 'old' } });
  expect(screen.getByRole('button', { name: 'Открыть AI-исследование' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Ещё ▾' })).not.toBeInTheDocument();
  expect(screen.getByText(/Исследование предыдущей версии/)).toBeInTheDocument();
});

test('BABOK default shows nonempty types and can open a composer in an empty type', async () => {
  const registry = compactReviewFixture();
  render(<BabokRegistryResult value={registry} latestVersion={{ ...version, registry }} onSave={vi.fn()} />);
  expect(screen.getByRole('combobox', { name: 'Тип требований' })).toHaveValue('all');
  expect(screen.getByRole('button', { name: /^Выбрать SR-001:/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Выбрать FR-/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Полнота:|Сверить полноту/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).toBeEnabled();
  fireEvent.click(screen.getAllByText('Добавить требование')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Функциональные требования', exact: true }));
  const input = await screen.findByRole('textbox', { name: 'Новое требование: FR' });
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: 'Система уведомляет сотрудника.' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'BR' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'FR' } });
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


test('a remote-version conflict blocks saving and downstream actions without discarding local edits', () => {
  header({ conflict: true }, { dirty: true });
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Сохранить изменения' })).not.toHaveClass('bg-indigo-600');
  expect(screen.getByRole('button', { name: 'Создать финальную версию' })).toBeDisabled();
  screen.getByRole('button', { name: 'Ещё ▾' }).parentElement.open = true;
  expect(screen.getByRole('button', { name: 'Сохранить и запустить AI-исследование' })).toBeDisabled();
});
