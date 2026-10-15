// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ProposalReview from './ProposalReview.jsx';
import { reverseProposal } from './proposal-review.js';
import { DraftContext } from './review-context.js';

afterEach(cleanup);

const types = ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON'];

function makeState({ groups = {}, decisions = {}, reservedIds = [] } = {}) {
  const content = {
    groups: Object.fromEntries(types.map((type) => [type, groups[type] || []])),
    context: [],
    analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [] },
    materials: { primary: { artifactId: 'primary' } },
    summary: { counts: Object.fromEntries(types.map((type) => [type, groups[type]?.length || 0])) },
  };
  return {
    content,
    decisions: { acceptedEnhancementKeys: [], rejectedEnhancementKeys: [], review: { schemaVersion: 1 }, ...decisions },
    reservedIds,
  };
}

function renderProposal({ state = makeState(), enhancement, decision } = {}) {
  const dispatch = vi.fn();
  render(
    <DraftContext.Provider value={{ state, content: state.content, dispatch }}>
      <ProposalReview enhancement={enhancement} decision={decision}>
        {(open) => <div>
          <button type="button" onClick={() => open('accepted')}>Открыть принятие</button>
          <button type="button" onClick={() => open('rejected')}>Открыть отклонение</button>
        </div>}
      </ProposalReview>
    </DraftContext.Provider>,
  );
  return { dispatch };
}

test('allows editing and accepting a new structured NFR proposal', () => {
  const enhancement = {
    key: 'insight:nfr', targetType: 'NFR', text: 'Модельная формулировка', rationale: 'Снижает риск простоя.', targetIds: ['BR-001'],
    category: 'Надёжность', scope: 'Все офисы', verificationMethod: 'Нагрузочный тест',
  };
  const { dispatch } = renderProposal({ enhancement });

  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  expect(screen.getByRole('dialog', { name: 'Проверить AI-предложение' })).toBeInTheDocument();
  expect(screen.getByText('Обоснование: Снижает риск простоя.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Итоговая формулировка' }), { target: { value: 'Проверенная формулировка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));

  expect(dispatch).toHaveBeenCalledOnce();
  const action = dispatch.mock.calls[0][0];
  expect(action.type).toBe('restore');
  expect(action.value.content.groups.NFR).toHaveLength(1);
  expect(action.value.content.groups.NFR[0]).toMatchObject({ text: 'Проверенная формулировка', category: 'Надёжность', fromResearch: true, researchEnhancementKey: 'insight:nfr' });
  expect(action.value.content.groups.NFR[0].relatedTo).toEqual([]);
});

test('keeps accepting disabled until text and required structured fields are valid', () => {
  const enhancement = { key: 'insight:invalid', targetType: 'NFR', text: '', category: '', scope: '', verificationMethod: '' };
  renderProposal({ enhancement });

  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  const accept = screen.getByRole('button', { name: 'Принять точное изменение' });
  expect(accept).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Итоговая формулировка' }), { target: { value: 'Есть текст' } });
  expect(accept).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Категория' }), { target: { value: 'Доступность' } });
  expect(accept).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Область' }), { target: { value: 'Резервирование' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Метод проверки' }), { target: { value: 'Тест повторного запроса' } });
  expect(accept).toBeEnabled();
});

test('supports replacing an existing requirement after selecting its target', () => {
  const state = makeState({ groups: { FR: [{ id: 'FR-001', text: 'Старая формулировка', relatedTo: [] }] } });
  const enhancement = { key: 'insight:replace', targetType: 'FR', text: 'Новое предложение' };
  const { dispatch } = renderProposal({ state, enhancement });

  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Действие предложения' }), { target: { value: 'replace' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Цель замены' }), { target: { value: 'FR-001' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Итоговая формулировка' }), { target: { value: 'Обновлённая формулировка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));

  expect(dispatch.mock.calls[0][0].value.content.groups.FR).toEqual([expect.objectContaining({ id: 'FR-001', text: 'Обновлённая формулировка' })]);
});

test('rejects a proposal that has not been added yet', () => {
  const enhancement = { key: 'insight:reject', targetType: 'FR', text: 'Не принимать' };
  const { dispatch } = renderProposal({ enhancement });

  fireEvent.click(screen.getByRole('button', { name: 'Открыть отклонение' }));
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch.mock.calls[0][0].value.decisions.rejectedEnhancementKeys).toContain('insight:reject');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('asks how to handle an accepted proposal before retaining it manually', () => {
  const enhancement = { key: 'insight:retain', targetType: 'FR', text: 'AI-требование' };
  const state = makeState({
    groups: { FR: [{ id: 'FR-001', text: 'Ручная редакция', researchEnhancementKey: 'insight:retain', fromResearch: true }] },
    decisions: { review: { schemaVersion: 1, proposals: { 'insight:retain': { operation: 'add', targetType: 'FR', targetId: 'FR-001', after: { text: 'AI-требование' } } } } },
  });
  const { dispatch } = renderProposal({ state, enhancement });

  fireEvent.click(screen.getByRole('button', { name: 'Открыть отклонение' }));
  expect(screen.getByRole('dialog', { name: 'Отменить принятие предложения' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Оставить как ручное требование' }));
  expect(dispatch.mock.calls[0][0].value.content.groups.FR[0]).toMatchObject({ fromResearch: false, manuallyEdited: true });
  expect(dispatch.mock.calls[0][0].value.content.groups.FR[0]).not.toHaveProperty('researchEnhancementKey');
});

test('can restore the previous requirement when reversing a replacement', () => {
  const enhancement = { key: 'insight:restore', targetType: 'FR', text: 'Новое требование' };
  const state = makeState({
    groups: { FR: [{ id: 'FR-002', text: 'Новое требование', researchEnhancementKey: 'insight:restore', fromResearch: true }] },
    decisions: { review: { schemaVersion: 1, proposals: { 'insight:restore': { operation: 'replace', targetType: 'FR', targetId: 'FR-002', before: { id: 'FR-001', text: 'Прежнее требование' }, after: { text: 'Новое требование' } } } } },
  });
  const { dispatch } = renderProposal({ state, enhancement });

  fireEvent.click(screen.getByRole('button', { name: 'Открыть отклонение' }));
  expect(screen.getByText(/При отмене восстановится: Прежнее требование/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Не менять решение' }));
  fireEvent.click(screen.getByRole('button', { name: 'Открыть отклонение' }));
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Отменить принятие предложения' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть отклонение' }));
  fireEvent.click(screen.getByRole('button', { name: 'Восстановить прежнее требование' }));
  expect(dispatch.mock.calls[0][0].value.content.groups.FR).toEqual([{ id: 'FR-001', text: 'Прежнее требование' }]);
});

test('shows proposal warnings, fallback rationale, missing links, and a field diff', () => {
  const enhancement = { key: 'insight:warning', targetType: 'FR', text: 'Предложить уточнить канал协作' };
  renderProposal({ enhancement });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));

  expect(screen.getByText('Обоснование: Не предоставлено моделью.')).toBeInTheDocument();
  expect(screen.getByText('Связи: Не указаны')).toBeInTheDocument();
  expect(screen.getAllByRole('note')).toHaveLength(2);
  expect(screen.getByRole('table', { name: 'Сравнение полей предложения' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Тип предложения' }), { target: { value: 'BR' } });
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Проверить AI-предложение' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('surfaces a lineage conflict when an apparently valid replacement is accepted', () => {
  const state = makeState({ groups: { FR: [{ id: 'FR-001', text: 'Уже изменено', researchEnhancementKey: 'other:key' }] } });
  const enhancement = { key: 'insight:new', targetType: 'FR', text: 'Новое предложение' };
  const { dispatch } = renderProposal({ state, enhancement });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Действие предложения' }), { target: { value: 'replace' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Цель замены' }), { target: { value: 'FR-001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  expect(screen.getByRole('alert')).toHaveTextContent('другим AI-предложением');
  expect(dispatch).not.toHaveBeenCalled();
});

test('can remove a currently accepted proposal when no prior decision exists', () => {
  const enhancement = { key: 'insight:remove-without-prior', targetType: 'FR', text: 'Удалить это' };
  const state = makeState({ groups: { FR: [{ id: 'FR-001', text: 'Удалить это', researchEnhancementKey: enhancement.key }] } });
  const { dispatch } = renderProposal({ state, enhancement });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть отклонение' }));
  expect(screen.getByRole('button', { name: 'Удалить принятое требование' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Удалить принятое требование' }));
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch.mock.calls[0][0].value.content.groups.FR).toEqual([]);
});

test('accepting or replacing retains confirmation conditions and links existing GAPs only', () => {
  const state = makeState({ groups: { FR: [{ id: 'FR-001', text: 'Старое', relatedTo: ['BR-001'] }], BR: [{ id: 'BR-001', text: 'Цель' }] } });
  state.content.analysis.GAP = [{ id: 'GAP-002', text: 'Статусы документов', affectedIds: ['FR-001'] }];
  const enhancement = { key: 'conditions:0', targetType: 'FR', text: 'Документы доступны сотруднику', confirmationConditions: 'Согласовать статусы (GAP-002), несуществующий GAP-999.', rationale: 'Не запрашивать повторно', targetIds: ['FR-001'] };
  const { dispatch } = renderProposal({ state, enhancement });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  const next = dispatch.mock.calls[0][0].value;
  expect(next.content.groups.FR.at(-1).relatedTo).toEqual(['GAP-002']);
  expect(next.content.analysis.traceability).toContainEqual(expect.objectContaining({ to: 'FR-001', status: 'Предполагается' }));
  expect(next.decisions.review.proposals['conditions:0']).toMatchObject({ confirmationConditions: enhancement.confirmationConditions, rationale: enhancement.rationale });
});

test('explicit replacement defaults to its target, preserves fields and can be reversed', () => {
  const original = { id: 'SR-001', text: 'Исходная потребность', role: 'Владелец', relatedTo: ['BR-001'], quality: 'Готово' };
  const state = makeState({ groups: { SR: [original] } });
  const enhancement = { key: 'change:0', operation: 'replace', targetId: 'SR-001', targetType: 'SR', text: 'Уточнённая потребность' };
  const { dispatch } = renderProposal({ state, enhancement });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  expect(screen.getByLabelText('Действие предложения')).toHaveValue('replace');
  expect(screen.getByLabelText('Цель замены')).toHaveValue('SR-001');
  expect(screen.getByRole('button', { name: 'Принять точное изменение' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  const next = dispatch.mock.calls[0][0].value;
  expect(next.content.groups.SR).toHaveLength(1);
  expect(next.content.groups.SR[0]).toMatchObject({ id: original.id, role: original.role, text: enhancement.text });
  expect(next.decisions.review.proposals['change:0'].before).toEqual(original);
  expect(reverseProposal(next, enhancement.key, false).content.groups.SR).toEqual([original]);
});

test('missing explicit replacement target blocks acceptance rather than adding', () => {
  renderProposal({ enhancement: { key: 'missing', operation: 'replace', targetId: 'FR-999', targetType: 'FR', text: 'Новая формулировка' } });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  expect(screen.getByLabelText('Действие предложения')).toHaveValue('replace');
  expect(screen.getByRole('button', { name: 'Принять точное изменение' })).toBeDisabled();
});

test('prefills and applies the proposed metric when the goal text stays unchanged', () => {
  const original = { id: 'BR-001', text: 'Увеличить регулярность накоплений', successIndicator: null, relatedIds: [] };
  const enhancement = { key: 'metric', operation: 'replace', targetType: 'BR', targetId: 'BR-001', text: original.text, successIndicator: 'Доля клиентов с пополнением каждый месяц' };
  const { dispatch } = renderProposal({ state: makeState({ groups: { BR: [original] } }), enhancement });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть принятие' }));
  expect(screen.getByRole('textbox', { name: 'Критерий успеха' })).toHaveValue(enhancement.successIndicator);
  fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
  expect(dispatch.mock.calls[0][0].value.content.groups.BR[0]).toMatchObject({ text: original.text, successIndicator: enhancement.successIndicator });
});
