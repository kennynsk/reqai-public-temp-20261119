// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { BabokRegistryResult } from './AsyncJobWorkspace.jsx';
import { sharedQuestionFixture } from './question-clarification.fixture.js';
import { RequirementsReviewContext } from './requirements-review-context.js';
import { ReviewSessionProvider } from './ReviewDraftProvider.jsx';

const raf = (fn) => requestAnimationFrame(fn);
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); sessionStorage.clear(); });
function setup({ registry = sharedQuestionFixture(), decisions = {}, workflow = {}, baseVersionId = 'v1', ...props } = {}) {
  const save = vi.fn();
  const tree = <ReviewSessionProvider scope="test" jobId="shared" baseVersionId={baseVersionId}><RequirementsReviewContext.Provider value={workflow}><BabokRegistryResult value={registry} latestVersion={{ versionId: 'v1', registry, decisions }} onSave={save} {...props} /></RequirementsReviewContext.Provider></ReviewSessionProvider>;
  render(tree);
  return { registry, save };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Разобрать вопрос' }));
const close = () => fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть вопрос' }).at(-1));

test('one shared GAP has two questions and ten unique requirement checks, with context evidence outside checks', async () => {
  const { save } = setup();
  open();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByText('Как обрабатывать недоступный канал?')).toBeVisible();
  expect(screen.getAllByRole('textbox', { name: 'Ответ на GAP-001' })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Проверка требований · 0 из 10' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /^Редактировать (BR|SR|FR)-/ })).toHaveLength(10);
  expect(screen.queryByRole('button', { name: 'Редактировать TERM-001' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ответ на GAP-001'), { target: { value: 'Электронная почта, повтор через час.' } });
  close();
  await new Promise(raf);
  fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ }));
  expect(screen.getAllByRole('article').filter((node) => node.id === 'record-GAP-001')).toHaveLength(1);
  open();
  expect(screen.getByLabelText('Ответ на GAP-001')).toHaveValue('Электронная почта, повтор через час.');
  expect(screen.getByRole('button', { name: 'Закрыть как решённый' })).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});

test('embedded FR edits survive back and close, and global save includes hidden drafts without BR fields', async () => {
  const { save } = setup(); open();
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать FR-004' }));
  const panel = screen.getByRole('dialog');
  expect(within(panel).queryByLabelText('Критерий успеха FR-004')).not.toBeInTheDocument();
  expect(within(panel).queryByLabelText('Роль FR-004')).not.toBeInTheDocument();
  fireEvent.change(within(panel).getByLabelText('Текст требования FR-004'), { target: { value: 'Система отправляет уведомление по электронной почте.' } });
  fireEvent.click(screen.getByRole('button', { name: '← К вопросу GAP-001' }));
  close(); await new Promise(raf);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(save.mock.calls[0][0].registry.groups.FR[3].text).toContain('электронной почте');
  expect(save.mock.calls[0][0].registry.groups.FR[3].quality).toBe('Готово');
  expect(save.mock.calls[0][0].decisions.review?.gaps?.['GAP-001']?.state).not.toBe('closed');
});

test('closing restores the registry filter, selection and focus without saving', async () => {
  const { save } = setup();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'FR' } });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'FR-004' } });
  const trigger = screen.getByRole('button', { name: 'Разобрать вопрос' }); trigger.focus(); open();
  fireEvent.keyDown(screen.getByRole('dialog').querySelector('aside'), { key: 'Escape' });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByRole('searchbox')).toHaveValue('FR-004');
  expect(screen.getByRole('button', { name: /^Выбрать FR-004:/ })).toHaveAttribute('aria-pressed', 'true');
  expect(save).not.toHaveBeenCalled();
});

test('QUESTION hash resolves its GAP and a missing target is recoverable', async () => {
  window.history.replaceState({}, '', '/tasks/shared#record-QUESTION-002'); setup();
  expect(screen.getByRole('dialog', { name: 'Уточнение GAP-001' })).toBeVisible();
  close(); await new Promise(raf);
  window.history.replaceState({}, '', '/tasks/shared#record-GAP-missing');
  fireEvent(window, new Event('hashchange'));
  expect(screen.getByRole('dialog', { name: 'Уточнение GAP-missing' })).toHaveTextContent('Вопрос не найден');
});

test('missing references block completion while a partial AI answer retains its blocker', () => {
  const registry = sharedQuestionFixture(); registry.analysis.GAP[0].affectedIds.push('FR-missing');
  const answer = 'По электронной почте';
  const decisions = { review: { gaps: { 'GAP-001': { state: 'answered', answer } }, discussionProposals: { p: { decision: 'accepted', changes: [], recordedAt: '2026-10-01T00:00:00Z', clarification: { gapId: 'GAP-001', answer, canResolve: false, remainingQuestions: ['Повтор?'] } } } } };
  setup({ registry, decisions }); open();
  expect(screen.getByText('Связь не найдена')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Закрыть как решённый' })).toBeDisabled();
  expect(screen.getByRole('status', { name: 'Статус проверки GAP-001' })).toHaveTextContent(/Повтор|частич|оставш/i);
});

test('global validation reveals an invalid hidden NFR inside the current question workspace', async () => {
  const registry = sharedQuestionFixture(); registry.groups.NFR = [{ ...registry.groups.FR[0], id: 'NFR-001', category: 'Производительность' }];
  const { save } = setup({ registry });
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'NFR' } });
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать', exact: true }));
  fireEvent.change(screen.getByLabelText('Категория NFR-001'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ })); open();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить требования' }));
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByLabelText('Категория NFR-001')).toHaveFocus());
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Категория'); expect(save).not.toHaveBeenCalled();
});

test('queue origin safely falls back after its question disappears and closure does not save', async () => {
  setup(); fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ })); open();
  fireEvent.click(screen.getByRole('button', { name: 'Снять с рассмотрения…' }));
  fireEvent.change(screen.getByLabelText('Причина решения'), { target: { value: 'Решение не входит в текущий объём' } });
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить решение' })); close();
  await waitFor(() => expect(document.getElementById('record-GAP-summary')).toHaveFocus());
  expect(screen.getByText('В этом списке нет вопросов.')).toBeVisible();
});

test('keyboard focus wraps within the active surface and skips hidden AI controls', () => {
  setup({ jobId: 'shared' }); open();
  const shell = screen.getByRole('dialog').querySelector('aside');
  const save = within(shell).getByRole('button', { name: 'Сохранить требования' });
  const closeButton = within(shell).getByRole('button', { name: 'Закрыть вопрос' });
  expect(save).toBeDisabled();
  const source = within(shell).getByText('Источник и связи').closest('summary');
  source.focus(); fireEvent.keyDown(shell, { key: 'Tab' }); expect(closeButton).toHaveFocus();
  fireEvent.keyDown(shell, { key: 'Tab', shiftKey: true }); expect(source).toHaveFocus();
  fireEvent.change(screen.getByLabelText('Ответ на GAP-001'), { target: { value: 'Проверяем сохранение' } });
  expect(save).toBeEnabled();
  save.focus(); fireEvent.keyDown(shell, { key: 'Tab' }); expect(closeButton).toHaveFocus();
  fireEvent.keyDown(shell, { key: 'Tab', shiftKey: true }); expect(save).toHaveFocus();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

test('save errors remain visible and comparing a conflict closes the question before opening recovery', async () => {
  const compare = vi.fn(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  setup({ workflow: { saveError: 'Сохранение не удалось', conflict: true, onCompareVersions: compare } }); open();
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Сохранение не удалось');
  fireEvent.click(screen.getByRole('button', { name: 'Сравнить версии' }));
  await waitFor(() => expect(compare).toHaveBeenCalledOnce());
});

test('a pending save disables question inputs and actions even though the panel uses a portal', () => {
  setup({ busy: true, initialRecordId: 'GAP-001' });
  expect(screen.getByLabelText('Ответ на GAP-001')).toBeDisabled();
  expect(screen.getAllByRole('button', { name: 'Изменение не требуется' })[0].closest('fieldset')).toBeDisabled();
  expect(screen.getAllByRole('button', { name: 'Закрыть вопрос' }).at(-1)).toBeEnabled();
});


test('manual confirmation shows wording and records an attestation without rewriting requirements', () => {
  const { registry, save } = setup(); open();
  const panel = screen.getByRole('dialog');
  expect(within(panel).getByText(registry.groups.FR[0].text)).toBeVisible();
  expect(within(panel).getByText(/Сохранение ответа не меняет формулировки/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Ответ на GAP-001'), { target: { value: 'Ответ для проверки' } });
  fireEvent.click(within(panel).getAllByRole('button', { name: 'Подтвердить учёт ответа' })[0]);
  fireEvent.click(within(panel).getByRole('button', { name: 'Сохранить требования' }));
  expect(save.mock.calls[0][0].registry.groups).toEqual(registry.groups);
  expect(save.mock.calls[0][0].decisions.review.gapRequirements['GAP-001']['BR-001'].state).toBe('incorporated');
});

test('no-change rationale stays inside its selected requirement row', () => {
  setup(); open();
  const edit = screen.getByRole('button', { name: 'Редактировать FR-004' });
  const row = edit.parentElement.parentElement;
  fireEvent.click(within(row).getByRole('button', { name: 'Изменение не требуется' }));
  expect(within(row).getByLabelText('Обоснование отсутствия изменения')).toBeVisible();
  fireEvent.change(within(row).getByLabelText('Обоснование отсутствия изменения'), { target: { value: 'Уже описано полностью' } });
  fireEvent.click(within(row).getByRole('button', { name: 'Подтвердить решение' }));
  expect(within(row).getByText('Уже описано полностью')).toBeVisible();
});

test('manual save status distinguishes a saved baseline from an initial version and unsaved changes', () => {
  setup(); open();
  expect(screen.getByText('Все изменения сохранены в версии требований')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Ответ на GAP-001'), { target: { value: 'Новый ответ' } });
  expect(within(screen.getByRole('dialog')).getByText('Есть несохранённые изменения')).toBeVisible();
  cleanup();
  setup({ baseVersionId: null }); open();
  expect(screen.getByText('Версия требований ещё не сохранена')).toBeVisible();
});
