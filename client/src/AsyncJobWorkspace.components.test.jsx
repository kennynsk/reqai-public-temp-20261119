// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ getJobTrace: vi.fn(), getJobTraceDetail: vi.fn() }));

vi.mock('./api/enterprise-api.js', () => ({
  enterpriseApi: { getJobTrace: apiMocks.getJobTrace, getJobTraceDetail: apiMocks.getJobTraceDetail },
  subscribeJobEvents: vi.fn(),
}));

import {
  ActiveJobPanel,
  AddRequirementForm,
  ArchivedLegacyResult,
  AiSettingsDisclosure,
  BackgroundJobIndicator,
  BabokAddRequirementForm,
  BabokRegistryResult,
  BabokRequirementCard,
  BabokRequirementsInsightsResult,
  BusinessContextInputCard,
  DebugPanel,
  DecompositionResult,
  EditableRequirementCard,
  ExecutionTimeline,
  FinalRequirementsEditor,
  InsightEnhancementDecisionRow,
  JobStateCard,
  Markdown,
  ModelControls,
  OriginalBusinessContext,
  RequirementsLayoutToggle,
  RequirementsInsightsResult,
  ResultPanel,
  ResultView,
  SourceBusinessContextSnapshot,
  SourceDataMenu,
  SourceRequirementsSnapshot,
  UnsavedNavigationDialog,
  WorkflowStepper,
} from './AsyncJobWorkspace.jsx';
import { ReviewDraftProvider } from './ReviewDraftProvider.jsx';
import { SessionContext } from './review-context.js';
import { useReviewState } from './review-state.js';
import { roomBookingRegistry } from './room-booking.fixture.js';

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getJobTrace.mockResolvedValue({ jobId: 'job', status: 'RUNNING', currentStep: null, createdAt: null, durationMs: null, timeline: [], nextCursor: null });
  apiMocks.getJobTraceDetail.mockResolvedValue({ state: 'NOT_RECORDED' });
});
afterEach(cleanup);

function ReviewHarness({ content, children }) {
  const review = useReviewState(content);
  return <ReviewDraftProvider review={review}>{children}</ReviewDraftProvider>;
}

function babokRecord(type = 'NFR', overrides = {}) {
  return {
    id: `${type}-001`,
    text: 'Требование',
    source: { artifactId: 'primary-artifact', locator: 'paragraph:1', quote: 'Требование' },
    provenance: 'Извлечено',
    quality: 'Готово',
    ...(type === 'NFR' ? { category: 'Производительность', scope: 'Сервис', verificationMethod: 'Нагрузочный тест', relatedTo: [] } : {}),
    ...overrides,
  };
}

describe('AsyncJobWorkspace presentational branches', () => {
  test('renders compact and desktop workflow states, including skipped stages', () => {
    render(<WorkflowStepper currentStage={4} completedStage={2} skippedStages={[3]} />);
    const workflow = screen.getByRole('region', { name: 'Прогресс подготовки требований' });
    expect(within(workflow).getByText('Этап 4 из 4')).toBeInTheDocument();
    expect(within(workflow).getAllByText('Пропущено').length).toBeGreaterThan(0);
    expect(within(workflow).getAllByRole('listitem')[0]).toHaveTextContent('Контекст');
    expect(within(workflow).getAllByRole('listitem')[3]).toHaveAttribute('aria-current', 'step');
    cleanup();
    render(<WorkflowStepper currentStage={99} />);
    expect(screen.getByText('Этап 99 из 4')).toBeInTheDocument();
    expect(screen.getByText('Опишите бизнес-задачу')).toBeInTheDocument();
    cleanup();
    render(<WorkflowStepper currentStage={3} completedStage={1} skippedStages={[3]} />);
    expect(screen.getAllByText('Пропущено').length).toBeGreaterThan(0);
  });

  test('renders settings disclosure, markdown fallback and markdown content', async () => {
    const children = <span>Настройки</span>;
    render(<AiSettingsDisclosure model="GC-Max">{children}</AiSettingsDisclosure>);
    fireEvent.click(screen.getByLabelText('Настройки AI'));
    expect(screen.getByText('GC-Max · рекомендуется')).toBeInTheDocument();
    expect(screen.getByText('Настройки')).toBeInTheDocument();
    cleanup();
    const emptyMarkdown = render(<Markdown />);
    expect(emptyMarkdown.container).toBeEmptyDOMElement();
    cleanup();
    render(<Markdown>**Безопасный текст**</Markdown>);
    expect(await screen.findByText('Безопасный текст')).toBeInTheDocument();
  });

  test('routes result views for plain, unsupported and structured legacy payloads', async () => {
    const callbacks = { save: vi.fn(), research: vi.fn(), final: vi.fn(), dirty: vi.fn() };
    render(<ResultView content="Обычный текст результата" onSaveRequirements={callbacks.save} onStartResearch={callbacks.research} onSaveFinal={callbacks.final} onDirtyChange={callbacks.dirty} />);
    expect(await screen.findByText('Обычный текст результата')).toBeInTheDocument();
    cleanup();

    render(<ResultView content={JSON.stringify({ mode: 'UNKNOWN' })} onSaveRequirements={callbacks.save} onStartResearch={callbacks.research} onSaveFinal={callbacks.final} onDirtyChange={callbacks.dirty} />);
    expect(screen.getByText('Формат результата не поддерживается текущей версией интерфейса.')).toBeInTheDocument();
    cleanup();

    const requirements = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] };
    render(<ResultView content={JSON.stringify({ mode: 'DECOMPOSITION', requirements })} latestVersion={{ versionId: 'v1', requirements, decisions: { skippedResearch: true }, createdAt: new Date().toISOString() }} onSaveRequirements={callbacks.save} onStartResearch={callbacks.research} onSaveFinal={callbacks.final} onDirtyChange={callbacks.dirty} />);
    expect(screen.getByText('Финальная версия требований')).toBeInTheDocument();
  });

  test('renders the result panel through its session boundary and falls back to a summary', () => {
    const callbacks = { save: vi.fn(), research: vi.fn(), final: vi.fn(), dirty: vi.fn(), view: vi.fn() };
    render(<ResultPanel result={{ jobId: 'panel-job', summary: 'Резервная сводка' }} resultContent="Текст результата" latestVersion={null} businessContext="Контекст" onSaveRequirements={callbacks.save} onStartResearch={callbacks.research} onSaveFinal={callbacks.final} onDirtyChange={callbacks.dirty} requestReviewView={callbacks.view} reservedIds={[]} />);
    expect(screen.getByText('Текст результата')).toBeInTheDocument();
    cleanup();
    render(<ResultPanel result={{ jobId: 'panel-job', summary: 'Резервная сводка' }} resultContent="" latestVersion={null} onSaveRequirements={callbacks.save} onStartResearch={callbacks.research} onSaveFinal={callbacks.final} onDirtyChange={callbacks.dirty} requestReviewView={callbacks.view} />);
    expect(screen.getByText('Резервная сводка')).toBeInTheDocument();
    cleanup();
    render(<ResultPanel result={{ jobId: 'panel-job' }} resultContent="" latestVersion={null} onSaveRequirements={callbacks.save} onStartResearch={callbacks.research} onSaveFinal={callbacks.final} onDirtyChange={callbacks.dirty} requestReviewView={callbacks.view} />);
    expect(document.querySelector('section')).toBeInTheDocument();
  });

  test('covers legacy research filters, decisions, source/context views and final transition', () => {
    const requirements = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [{ id: 'FT-1', text: 'Старая функция', fromResearch: true, researchEnhancementKey: 'old:0' }], nonfunctional: [] };
    const value = {
      mode: 'REQUIREMENTS_INSIGHTS',
      inputRequirementsVersionId: 'input-v1',
      baseRequirements: requirements,
      insights: [
        { id: 'old', category: 'trends', title: 'Старая рекомендация', summary: 'Уточнить', applicability: 40, enhancements: [{ targetType: 'functional', text: 'Старая функция' }] },
        { id: 'new', category: 'risks', title: 'Новый риск', summary: 'Проверить отказоустойчивость', applicability: 90, detail: 'Подробности риска', relatedTo: ['BT-1'], source_types: ['regulatory', 'custom'], enhancements: [{ targetType: 'nonfunctional', text: 'Новая проверка', rationale: 'Снижает риск' }] },
      ],
    };
    const latestVersion = { versionId: null, requirements, decisions: {} };
    const callbacks = { save: vi.fn(), dirty: vi.fn(), requestView: vi.fn() };
    const { rerender } = render(<SessionContext.Provider value={{ view: 'insights', requestView: callbacks.requestView }}><RequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByText('Результаты AI-исследования')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Риски · 1/ }));
    expect(screen.getByRole('heading', { name: 'Новый риск' })).toBeInTheDocument();
    expect(screen.queryByText('Старая рекомендация')).not.toBeInTheDocument();
    expect(screen.getByText('Подробности риска')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Принять улучшение: Новая проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
    expect(screen.getByText('Выбрано улучшений: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить улучшение: Новая проверка' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить принятое требование' }));
    expect(screen.getByText('Выбрано улучшений: 0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Исходные данные'));
    fireEvent.click(screen.getByRole('button', { name: 'Бизнес-задача' }));
    expect(callbacks.requestView).toHaveBeenCalledWith('context', { preserveDraft: true });
    rerender(<SessionContext.Provider value={{ view: 'context', requestView: callbacks.requestView }}><RequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent('Контекст');
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    rerender(<SessionContext.Provider value={{ view: 'insights', requestView: callbacks.requestView }}><RequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    fireEvent.click(screen.getByText('Исходные данные'));
    fireEvent.click(screen.getByRole('button', { name: 'Требования для AI' }));
    expect(callbacks.requestView).toHaveBeenCalledWith('source', { preserveDraft: true });
    rerender(<SessionContext.Provider value={{ view: 'source', requestView: callbacks.requestView }}><RequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByText('Требования, переданные в AI-исследование')).toBeInTheDocument();
    cleanup();

    const saved = { ...latestVersion, versionId: 'v2', decisions: { acceptedEnhancementKeys: [], rejectedEnhancementKeys: [] } };
    render(<SessionContext.Provider value={{ view: 'insights', requestView: callbacks.requestView }}><RequirementsInsightsResult value={value} latestVersion={saved} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByRole('button', { name: 'К финальным требованиям' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'К финальным требованиям' }));
    expect(callbacks.requestView).toHaveBeenCalledWith('final', { preserveDraft: false });
    cleanup();
    render(<SessionContext.Provider value={{ view: 'final', requestView: callbacks.requestView }}><RequirementsInsightsResult value={value} latestVersion={saved} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByText('Финальная версия требований')).toBeInTheDocument();
  });

  test('covers BABOK research cards, accepted final registry and read-only views', () => {
    const registry = roomBookingRegistry();
    const value = {
      mode: 'REQUIREMENTS_INSIGHTS',
      baseRegistry: registry,
      insights: [{ id: 'babok-insight', category: 'patterns', title: 'Паттерн', summary: 'Добавить контроль', detail: 'Подробное описание', relatedTo: ['BR-001'], source_types: ['open_standard'], enhancements: [{ targetType: 'FR', targetIds: ['BR-001'], text: 'Новая функция', rationale: 'Связать с целью', confirmationConditions: 'Согласовать нормативные сроки' }] }],
    };
    const callbacks = { save: vi.fn(), dirty: vi.fn(), requestView: vi.fn() };
    const latestVersion = { versionId: null, registry, decisions: {} };
    render(<SessionContext.Provider value={{ view: 'insights', requestView: callbacks.requestView }}><BabokRequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByText('Согласовать нормативные сроки')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Принять улучшение: Новая функция' }));
    expect(screen.getByRole('textbox', { name: 'Итоговая формулировка' })).toHaveValue('Новая функция');
    fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить новую редакцию' }));
    expect(callbacks.save).toHaveBeenCalledWith(expect.objectContaining({ registry: expect.objectContaining({ groups: expect.objectContaining({ FR: expect.arrayContaining([expect.objectContaining({ text: 'Новая функция', researchEnhancementKey: 'babok-insight:0' })]) }) }) }));
    cleanup();
    render(<SessionContext.Provider value={{ view: 'source', requestView: callbacks.requestView }}><BabokRequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByText('Требования, переданные в AI-исследование')).toBeInTheDocument();
    cleanup();
    render(<SessionContext.Provider value={{ view: 'context', requestView: callbacks.requestView }}><BabokRequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent('Контекст');
    cleanup();
    render(<SessionContext.Provider value={{ view: 'final', requestView: callbacks.requestView }}><BabokRequirementsInsightsResult value={value} latestVersion={{ ...latestVersion, versionId: 'final-v1', registry }} businessContext="Контекст" onSaveFinal={callbacks.save} onDirtyChange={callbacks.dirty} /></SessionContext.Provider>);
    expect(screen.getByText('Финальная версия требований')).toBeInTheDocument();
  });

  test('supports legacy card save, cancel, empty text and read-only mode', () => {
    const onEdit = vi.fn();
    const onDraftChange = vi.fn();
    render(<EditableRequirementCard requirement={{ id: 'FT-1', text: 'Исходная функция' }} onEdit={onEdit} onDelete={vi.fn()} onDraftChange={onDraftChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия для FT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    const text = screen.getByRole('textbox', { name: 'Текст требования FT-1' });
    fireEvent.change(text, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Исходная функция')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Действия для FT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования FT-1' }), { target: { value: 'Новая функция' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onEdit).toHaveBeenCalledWith('Новая функция');
    expect(onDraftChange).toHaveBeenCalledWith(true);
    expect(onDraftChange).toHaveBeenLastCalledWith(false);
    cleanup();
    render(<EditableRequirementCard requirement={{ id: 'FT-1', text: 'Только чтение' }} readOnly onEdit={onEdit} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Действия для FT-1' })).not.toBeInTheDocument();
  });

  test('validates and saves structured BABOK card fields, including related records', () => {
    const onEdit = vi.fn();
    const content = {
      groups: {
        NFR: [babokRecord('NFR')],
        BR: [babokRecord('BR', { id: 'BR-001', relatedIds: [] })],
      },
      context: [],
      analysis: { GAP: [], HYP: [], TERM: [] },
    };
    render(<ReviewHarness content={content}><BabokRequirementCard type="NFR" requirement={babokRecord('NFR', { quality: 'Требует уточнения', fromResearch: true, researchEnhancementKey: 'i:0' })} materials={{ primary: { artifactId: 'primary-artifact' } }} manuallyEdited onEdit={onEdit} onDelete={vi.fn()} onDraftChange={vi.fn()} onNavigate={vi.fn()} /></ReviewHarness>);
    expect(screen.getByText('Изменено', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('AI-предложение')).toBeInTheDocument();
    expect(screen.queryByText('решение сохранено')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Источник и связи'));
    expect(screen.getByText('Производительность')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Действия для NFR-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByText('Редактировать связи'));
    const relation = screen.getByRole('checkbox', { name: 'BR-001' });
    fireEvent.click(relation);
    fireEvent.change(screen.getByLabelText('Категория NFR-001'), { target: { value: 'Скорость' } });
    fireEvent.change(screen.getByLabelText('Область NFR-001'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));
    expect(onEdit).toHaveBeenCalledWith('Требование', expect.objectContaining({ category: 'Скорость', scope: null, relatedTo: ['BR-001'] }));
    cleanup();
    const invalid = babokRecord('NFR', { category: '' });
    render(<BabokRequirementCard type="NFR" requirement={invalid} materials={{ primary: { artifactId: 'a' } }} onEdit={onEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия для NFR-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Заполните поле «Категория».');
    cleanup();
    render(<ReviewHarness content={{ groups: { BR: [babokRecord('BR', { id: 'BR-002', text: 'Исходная цель', quality: 'Неизвестное качество' })] }, context: [], analysis: { GAP: [], HYP: [], TERM: [] } }}><BabokRequirementCard type="BR" requirement={{ id: 'BR-002', quality: 'Неизвестное качество' }} materials={{}} onEdit={onEdit} onDelete={vi.fn()} onDraftChange={vi.fn()} /></ReviewHarness>);
    expect(screen.getByText('Оценка качества: Не определена')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-002' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByText('Источник и связи'));
    expect(screen.getByText('Происхождение:').parentElement).toHaveTextContent('—');
    expect(screen.queryByText('Оценка качества:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  });

  test('covers BABOK relation editing and empty metadata fallbacks', () => {
    const registry = {
      groups: { BR: [babokRecord('BR', { id: 'BR-010', relatedIds: [] })], SR: [], FR: [babokRecord('FR', { id: 'FR-010' })], NFR: [], TR: [], CON: [] },
      context: [],
      analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [], questions: [] },
    };
    const onEdit = vi.fn();
    render(<ReviewHarness content={registry}><BabokRequirementCard type="BR" requirement={{ id: 'BR-010', text: 'Цель', relatedIds: [] }} materials={{}} onEdit={onEdit} onDelete={vi.fn()} onDraftChange={vi.fn()} /></ReviewHarness>);
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-010' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByText('Редактировать связи'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'FR-010' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Цель')).toBeInTheDocument();
  });

  test('supports uncontrolled BABOK editing and removing an existing relation', () => {
    const onEdit = vi.fn();
    render(<BabokRequirementCard type="NFR" requirement={babokRecord('NFR', { id: 'NFR-local' })} materials={{}} onEdit={onEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия для NFR-local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования NFR-local' }), { target: { value: 'Локальная правка' } });
    fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));
    expect(onEdit).toHaveBeenCalledWith('Локальная правка', {});

    cleanup();
    const content = {
      groups: { BR: [babokRecord('BR', { id: 'BR-local', relatedIds: ['FR-local'] })], FR: [babokRecord('FR', { id: 'FR-local' })] },
      context: [],
      analysis: { GAP: [], HYP: [], TERM: [] },
    };
    const controlledEdit = vi.fn();
    render(<ReviewHarness content={content}><BabokRequirementCard type="BR" requirement={content.groups.BR[0]} materials={{}} onEdit={controlledEdit} onDelete={vi.fn()} /></ReviewHarness>);
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BR-local' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByText('Редактировать связи'));
    const relation = screen.getByRole('checkbox', { name: 'FR-local' });
    expect(relation).toBeChecked();
    fireEvent.click(relation);
    fireEvent.click(screen.getByRole('button', { name: 'Применить к черновику' }));
    expect(controlledEdit).toHaveBeenCalledWith('Требование', expect.objectContaining({ relatedIds: [] }));
  });

  test('renders empty and plural BABOK research cards with metadata fallbacks', () => {
    const registry = roomBookingRegistry();
    const value = {
      mode: 'REQUIREMENTS_INSIGHTS',
      baseRegistry: registry,
      insights: [
        { id: 'empty-insight', category: 'mystery', title: '', summary: '' },
        { id: 'two-insight', category: 'risks', title: 'Две рекомендации', summary: 'Проверить оба пути', enhancements: [{ targetType: 'NFR', text: 'Первая рекомендация' }, { targetType: 'NFR', text: 'Вторая рекомендация' }] },
        { id: 'many-insight', category: 'standards', title: 'Пять рекомендаций', summary: 'Проверить соответствие', source_types: ['unlisted-source'], enhancements: Array.from({ length: 5 }, (_, index) => ({ targetType: 'BR', text: `Рекомендация ${index + 1}` })) },
      ],
    };
    render(<SessionContext.Provider value={{ view: 'insights', requestView: vi.fn() }}><BabokRequirementsInsightsResult value={value} latestVersion={{ registry, decisions: {} }} businessContext="Контекст" onSaveFinal={vi.fn()} onDirtyChange={vi.fn()} /></SessionContext.Provider>);
    expect(screen.getByRole('button', { name: 'Риски · 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стандарты и нормативы · 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Другие результаты · 1' })).toBeInTheDocument();
    expect(screen.getAllByText('Оценка не указана')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Риски · 1' }));
    expect(screen.getByRole('heading', { name: 'Две рекомендации' })).toBeInTheDocument();
    expect(screen.getAllByText('В NFR · нефункциональные требования')).toHaveLength(2);
    expect(screen.queryByText('Пять рекомендаций')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Стандарты и нормативы · 1' }));
    expect(screen.getAllByText('В BR · бизнес-требования')).toHaveLength(5);
    expect(screen.getByRole('heading', { name: 'Пять рекомендаций' })).toBeInTheDocument();
  });

  test('returns no UI for a historical insight payload without a valid BABOK registry', () => {
    const { container } = render(<BabokRequirementsInsightsResult value={{ baseRegistry: {}, insights: undefined }} latestVersion={{ decisions: {} }} businessContext="" onSaveFinal={vi.fn()} onDirtyChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('opens, cancels and adds legacy and BABOK requirements', () => {
    const onAdd = vi.fn();
    render(<AddRequirementForm type="functional" categoryLabel="Функциональные требования" onAdd={onAdd} onDraftChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить требование' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Новое требование: Функциональные требования' }), { target: { value: 'Новая функция' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
    expect(onAdd).toHaveBeenCalledWith('Новая функция');
    cleanup();
    render(<BabokAddRequirementForm type="BR" categoryLabel="Бизнес-требования" onAdd={onAdd} onDraftChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить требование' }));
    const input = screen.getByRole('textbox', { name: 'Новое требование: BR' });
    fireEvent.change(input, { target: { value: 'Новая цель' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
    expect(onAdd).toHaveBeenLastCalledWith('Новая цель');
    expect(screen.getByRole('button', { name: 'Добавить требование' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить требование' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByRole('textbox', { name: 'Новое требование: BR' })).not.toBeInTheDocument();
  });

  test('covers the legacy decomposition editor validation, deletion and save actions', () => {
    const requirements = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] };
    const onSave = vi.fn();
    const onStartResearch = vi.fn();
    render(<DecompositionResult value={{ mode: 'DECOMPOSITION', requirements }} latestVersion={{ requirements, decisions: {}, createdAt: new Date().toISOString() }} onSave={onSave} onStartResearch={onStartResearch} onDirtyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Не удалять' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(screen.getByText(/Удалено BT-1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }));
    expect(screen.getByText('Цель')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BT-1' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Введите формулировку требования');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    const business = screen.getByRole('region', { name: 'Бизнес-требования' });
    fireEvent.click(within(business).getByRole('button', { name: 'Добавить требование' }));
    fireEvent.change(within(business).getByRole('textbox', { name: 'Новое требование: Бизнес-требования' }), { target: { value: 'Новая цель' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить', exact: true }));
    expect(screen.getByText('Новая цель')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'functional' } });
    const functional = screen.getByRole('region', { name: 'Функциональные требования' });
    fireEvent.click(within(functional).getByRole('button', { name: 'Добавить требование' }));
    fireEvent.change(within(functional).getByRole('textbox', { name: 'Новое требование: Функциональные требования' }), { target: { value: 'Черновая функция' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: null, requirements: expect.objectContaining({ business: expect.arrayContaining([expect.objectContaining({ text: 'Новая цель' })]), functional: expect.arrayContaining([expect.objectContaining({ text: 'Черновая функция' })]) }) }));
    screen.getByRole('button', { name: 'Ещё ▾' }).parentElement.open = true;
    expect(screen.getByRole('button', { name: 'Сохранить и запустить AI-исследование' })).toBeEnabled();
    expect(onStartResearch).not.toHaveBeenCalled();
  });

  test('covers final legacy editor navigation, validation and optional research action', async () => {
    const requirements = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] };
    const latestVersion = { versionId: 'final-v1', requirements, decisions: {}, createdAt: new Date().toISOString() };
    const onSave = vi.fn();
    const onStartResearch = vi.fn();
    render(<FinalRequirementsEditor latestVersion={latestVersion} onSave={onSave} onShowInsights={vi.fn()} onShowSource={vi.fn()} onShowContext={vi.fn()} onStartResearch={onStartResearch} onDirtyChange={vi.fn()} researchSkipped />);
    expect(screen.getByRole('button', { name: 'Добавить AI-исследование' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить AI-исследование' }));
    expect(onStartResearch).toHaveBeenCalledWith({ requirementsVersionId: 'final-v1' });
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Текст требования BT-1' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Введите формулировку требования');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Действия для BT-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Не удалять' }));
    const functional = screen.getByRole('region', { name: 'Функциональные требования' });
    fireEvent.click(within(functional).getByRole('button', { name: 'Добавить требование' }));
    fireEvent.change(within(functional).getByRole('textbox', { name: 'Новое требование: Функциональные требования' }), { target: { value: 'Новая функция' } });
    fireEvent.click(within(functional).getByRole('button', { name: 'Добавить' }));
    expect(within(functional).getByText('Новая функция')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'final-v1', requirements: expect.objectContaining({ functional: expect.arrayContaining([expect.objectContaining({ text: 'Новая функция' })]) }) }));
    fireEvent.click(screen.getByRole('tab', { name: /functional · Функциональные требования/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Функциональные требования' })).toHaveFocus());
  });

  test('covers BABOK registry navigation, clarification filter, deletion undo and draft assembly', async () => {
    const registry = roomBookingRegistry();
    const onSave = vi.fn();
    const onStartResearch = vi.fn();
    const onDirtyChange = vi.fn();
    const latestVersion = { versionId: 'registry-v1', registry, decisions: {}, createdAt: new Date().toISOString() };
    render(<BabokRegistryResult value={registry} latestVersion={latestVersion} onSave={onSave} onStartResearch={onStartResearch} onDirtyChange={onDirtyChange} />);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/^Черновик сохранён ·/);
    screen.getByRole('button', { name: 'Ещё ▾' }).parentElement.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Запустить AI-исследование' }));
    expect(onStartResearch).toHaveBeenCalledWith({ requirementsVersionId: 'registry-v1' });
    fireEvent.click(screen.getByRole('button', { name: 'Завершить подготовку' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'registry-v1', decisions: { skippedResearch: true } }));

    fireEvent.click(screen.getByRole('button', { name: /^Выбрать FR-001:/ }));
    const functional = document.getElementById('record-FR-001');
    fireEvent.click(within(functional).getByRole('button', { name: 'BR-001', exact: true }));
    expect(await screen.findByRole('dialog', { name: /Бизнес-требование · BR-001/ })).toHaveTextContent('Сократить конфликты бронирования.');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть предпросмотр требования' }));
    fireEvent.click(screen.getByRole('button', { name: /^Выбрать BR-001:/ }));
    fireEvent.click(within(document.getElementById('record-BR-001')).getByRole('link', { name: 'BR-001' }));
    await waitFor(() => expect(document.getElementById('record-BR-001')).toHaveFocus());
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'all' } });
    const clarification = screen.getByRole('checkbox', { name: 'Нужно уточнить' });
    fireEvent.click(clarification);
    expect(screen.getByRole('heading', { name: 'Нет требований' })).toBeInTheDocument();
    fireEvent.click(clarification);

    const business = document.getElementById('record-BR-001');
    fireEvent.click(within(business).getByRole('button', { name: 'Действия для BR-001' }));
    fireEvent.click(within(business).getByRole('button', { name: 'Удалить', exact: true }));
    expect(screen.getByRole('dialog', { name: 'Удаление требования' })).toHaveTextContent('FR-001');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(screen.getByText(/Удалено BR-001/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить удаление' }));
    expect(screen.getByRole('button', { name: /^Выбрать BR-001:/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'SR' } });
    fireEvent.click(screen.getByText('Добавить требование', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Требования заинтересованных сторон', exact: true }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Новое требование: SR' }), { target: { value: 'Черновая роль' } });
    onSave.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ registry: expect.objectContaining({ groups: expect.objectContaining({ SR: expect.arrayContaining([expect.objectContaining({ text: 'Черновая роль', provenance: 'Предложено — требует подтверждения' })]) }) }) }));
  });

  test('covers final BABOK actions and a question link without a matching record', async () => {
    const registry = roomBookingRegistry();
    registry.analysis.GAP[0].affectedIds = ['MISSING-001'];
    const onStartResearch = vi.fn();
    const onBack = vi.fn();
    render(<BabokRegistryResult value={registry} latestVersion={{ versionId: 'final-registry', registry, decisions: {}, createdAt: new Date().toISOString() }} finalVersion onStartResearch={onStartResearch} onBack={onBack} onDirtyChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить AI-исследование' }));
    expect(onStartResearch).toHaveBeenCalledWith({ requirementsVersionId: 'final-registry' });
    fireEvent.click(screen.getByRole('button', { name: 'К результатам AI-исследования' }));
    expect(onBack).toHaveBeenCalled();
    cleanup();

    render(<BabokRegistryResult value={registry} latestVersion={{ registry, decisions: {} }} readOnly initialRecordId="GAP-001" onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Пробелы для уточнения/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'MISSING-001' }));
    expect(await screen.findByRole('dialog', { name: /Запись требования · MISSING-001/ })).toHaveTextContent('Запись недоступна');
    expect(screen.getByRole('heading', { name: /Пробелы для уточнения/ })).toBeInTheDocument();
  });

  test('uses previews for requirement references in questions and traceability', async () => {
    const registry = roomBookingRegistry();
    registry.analysis.traceability = [{ from: 'BR-001', to: 'FR-001', relation: 'Поддерживает', status: 'Полная' }];
    render(<BabokRegistryResult value={registry} latestVersion={{ registry, decisions: {} }} readOnly />);

    const business = screen.getByLabelText('Детали требования BR-001');
    expect(within(business).getByRole('link', { name: 'BR-001' })).toHaveAttribute('href', '#record-BR-001');

    fireEvent.click(screen.getByRole('button', { name: /^Вопросы(?: |$)/ }));
    const questions = screen.getByRole('region', { name: 'Вопросы для уточнения' });
    fireEvent.click(within(questions).getAllByRole('button', { name: 'BR-001' })[0]);
    expect(await screen.findByRole('dialog', { name: /Бизнес-требование · BR-001/ })).toHaveTextContent('Сократить конфликты бронирования.');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть предпросмотр требования' }));

    fireEvent.click(screen.getByRole('button', { name: 'Связи' }));
    const links = screen.getByRole('region', { name: 'Связи требований' });
    fireEvent.click(within(links).getAllByRole('button', { name: 'FR-001' })[0]);
    expect(await screen.findByRole('dialog', { name: /Функциональное требование · FR-001/ })).toHaveTextContent('Система запрещает пересекающиеся бронирования.');
  });

  test('covers legacy layout focus and enabled research actions', async () => {
    const requirements = { business: [{ id: 'BT-1', text: 'Цель' }], functional: [{ id: 'FT-1', text: 'Функция' }], nonfunctional: [] };
    const onStartResearch = vi.fn();
    render(<DecompositionResult value={{ mode: 'DECOMPOSITION', requirements }} latestVersion={{ versionId: 'legacy-v1', requirements, decisions: {}, createdAt: new Date().toISOString() }} onSave={vi.fn()} onStartResearch={onStartResearch} onDirtyChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Тип требований' }), { target: { value: 'functional' } });
    expect(screen.getByRole('combobox', { name: 'Тип требований' })).toHaveValue('functional');
    screen.getByRole('button', { name: 'Ещё ▾' }).parentElement.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Запустить AI-исследование' }));
    expect(onStartResearch).toHaveBeenCalledWith({ requirementsVersionId: 'legacy-v1' });
  });

  test('covers decision states and source snapshot empty states', () => {
    const onDecision = vi.fn();
    render(<div><InsightEnhancementDecisionRow enhancement={{ targetType: 'functional', text: 'Улучшение' }} decision="accepted" onDecision={onDecision} /><InsightEnhancementDecisionRow enhancement={{ targetType: 'unknown', text: 'Отклонённое' }} decision="rejected" onDecision={onDecision} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Принять улучшение: Улучшение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Принять улучшение: Отклонённое' }));
    expect(onDecision).toHaveBeenCalledWith('accepted');
    expect(onDecision).toHaveBeenCalledWith('accepted');
    cleanup();
    const onBack = vi.fn();
    render(<SourceRequirementsSnapshot requirements={{ business: [], functional: [{ id: 'FT-1', text: 'Функция' }], nonfunctional: [] }} initialRecordId="FT-1" onBack={onBack} />);
    expect(screen.getAllByText('Нет сформированных требований')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'К результатам AI-исследования' }));
    expect(onBack).toHaveBeenCalled();
  });

  test('covers context, source menu, layout toggle and compact input card states', () => {
    const callbacks = { context: vi.fn(), requirements: vi.fn(), layout: vi.fn(), open: vi.fn() };
    render(<div><SourceBusinessContextSnapshot value="" loading onBack={callbacks.context} /><SourceDataMenu onShowContext={callbacks.context} onShowRequirements={callbacks.requirements} /><OriginalBusinessContext value="" loading editable><span>Редактор</span></OriginalBusinessContext><BusinessContextInputCard open={false} onOpenChange={callbacks.open} running summary="Краткая задача"><span>Форма</span></BusinessContextInputCard><RequirementsLayoutToggle layout="rows" onChange={callbacks.layout} /></div>);
    expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent('Загружаем исходный контекст');
    fireEvent.click(screen.getByText('Исходные данные'));
    fireEvent.click(screen.getByRole('button', { name: 'Бизнес-задача' }));
    fireEvent.click(screen.getByLabelText('Исходный бизнес-контекст'));
    expect(screen.getByText('Редактор')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть форму бизнес-задачи' }));
    fireEvent.click(screen.getByRole('button', { name: 'Все требования' }));
    expect(callbacks.context).toHaveBeenCalled();
    expect(callbacks.open).toHaveBeenCalledWith(true);
    expect(callbacks.layout).toHaveBeenCalledWith('columns');
    cleanup();
    render(<SourceBusinessContextSnapshot value="" onBack={callbacks.context} />);
    expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent('Не удалось восстановить');
  });

  test('keeps an empty business-context form visible without a collapse control', () => {
    const onOpenChange = vi.fn();
    render(<BusinessContextInputCard open={false} onOpenChange={onOpenChange} running={false} summary=""><span>Пустая форма</span></BusinessContextInputCard>);
    expect(screen.getByText('Пустая форма')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /форму бизнес-задачи/ })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  test('covers fallback labels for historical and diagnostic edge states', async () => {
    cleanup();
    render(<div><OriginalBusinessContext value="" /><InsightEnhancementDecisionRow enhancement={{ text: 'Предложение без типа' }} onDecision={vi.fn()} /><ArchivedLegacyResult job={{ createdAt: new Date().toISOString() }} result={{}} /></div>);
    fireEvent.click(screen.getByLabelText('Исходный бизнес-контекст'));
    expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent('Не удалось восстановить');
    expect(screen.getByText('Предложение без типа')).toBeInTheDocument();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.queryByText('Сводка')).not.toBeInTheDocument();

    cleanup();
    apiMocks.getJobTrace.mockResolvedValueOnce({ jobId: 'edge-job', status: 'UNKNOWN', currentStep: null, createdAt: null, durationMs: null, timeline: [{ id: 'unknown-entry', source: 'SERVER_EVENT', category: 'worker', name: 'Неизвестное событие', status: 'MYSTERY', startedAt: null, durationMs: null, stepId: null, detail: { state: '' }, metadata: { fallback: true } }], nextCursor: null });
    render(<DebugPanel open jobId="edge-job" observations={[]} refreshKey={0} onClose={vi.fn()} triggerRef={{ current: null }} />);
    const entry = await screen.findByText('Неизвестное событие');
    fireEvent.click(entry.closest('button'));
    expect(screen.getByText('Детали: —')).toBeInTheDocument();
    expect(screen.getByText(/"fallback": true/)).toBeInTheDocument();

    cleanup();
    render(<OriginalBusinessContext value="" loading />);
    fireEvent.click(screen.getByLabelText('Исходный бизнес-контекст'));
    expect(screen.getByRole('region', { name: 'Текст исходной бизнес-задачи' })).toHaveTextContent('Загружаем исходный контекст');

    cleanup();
    render(<InsightEnhancementDecisionRow enhancement={{ targetType: 'unlisted', text: 'Проверить fallback' }} onDecision={vi.fn()} />);
    expect(screen.getByText('Проверить fallback')).toBeInTheDocument();

    cleanup();
    render(<DebugPanel open jobId={null} observations={[{ timestamp: new Date().toISOString(), type: 'reconnect' }]} refreshKey={0} onClose={vi.fn()} triggerRef={{ current: null }} />);
    const localEntry = await screen.findByText('Браузер восстанавливает связь');
    fireEvent.click(localEntry.closest('button'));
    expect(screen.getByText('Детали: не записаны')).toBeInTheDocument();
  });

  test('uses missing category data safely in snapshots and final BABOK views', () => {
    cleanup();
    render(<SourceRequirementsSnapshot requirements={{ functional: [{ id: 'FR-1', text: 'Функция' }] }} onBack={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Бизнес-требования' })).toHaveTextContent('Нет сформированных требований');
    cleanup();

    const registry = roomBookingRegistry();
    render(<BabokRequirementsInsightsResult value={{ mode: 'REQUIREMENTS_INSIGHTS', baseRegistry: registry, insights: [] }} latestVersion={{ versionId: 'final-without-registry', decisions: {} }} onSaveFinal={vi.fn()} onDirtyChange={vi.fn()} />);
    expect(screen.getByText('Финальная версия требований')).toBeInTheDocument();
  });

  test('assembles sparse historical insights without losing existing research records', () => {
    const onSaveFinal = vi.fn();
    const value = {
      mode: 'REQUIREMENTS_INSIGHTS',
      baseRequirements: {
        business: [],
        functional: [{ id: 'FT-no-number', text: 'Уже есть', fromResearch: true }],
        nonfunctional: [],
      },
      insights: [{
        id: 'sparse-insight',
        category: 'mystery',
        title: 'Слабая связь',
        summary: 'Уточнить формулировку',
        enhancements: [{ targetType: 'functional', text: 'Уже есть' }, { targetType: 'functional', text: 'Новая функция' }],
      }],
    };
    render(<RequirementsInsightsResult value={value} latestVersion={null} onSaveFinal={onSaveFinal} onDirtyChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Другие результаты · 1' })).toBeInTheDocument();
    const first = screen.getByRole('button', { name: 'Принять улучшение: Уже есть' });
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Принять улучшение: Новая функция' }));
    fireEvent.click(screen.getByRole('button', { name: 'Принять точное изменение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить финальную версию' }));
    expect(onSaveFinal).toHaveBeenCalledWith(expect.objectContaining({ requirements: expect.objectContaining({ functional: expect.arrayContaining([expect.objectContaining({ id: 'FT-no-number', text: 'Уже есть' }), expect.objectContaining({ id: 'FT-1', text: 'Уже есть', researchEnhancementKey: 'sparse-insight:0' }), expect.objectContaining({ id: 'FT-2', text: 'Новая функция', researchEnhancementKey: 'sparse-insight:1' })]) }) }));

    cleanup();
    render(<RequirementsInsightsResult value={{ mode: 'REQUIREMENTS_INSIGHTS', baseRequirements: { business: [] }, insights: undefined }} latestVersion={null} onSaveFinal={vi.fn()} onDirtyChange={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Результаты AI-исследования: список и детали' })).toHaveTextContent('Нет результатов');
  });

  test('renders model controls and execution states', () => {
    const setters = { model: vi.fn(), temperature: vi.fn(), reasoning: vi.fn() };
    render(<div><ModelControls models={['glm-5.3-flash', 'other']} model="glm-5.3-flash" setModel={setters.model} temperature={0.2} setTemperature={setters.temperature} reasoning="low" setReasoning={setters.reasoning} capabilities={{}} /><ExecutionTimeline job={{ type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20 }} /></div>);
    expect(screen.getByText(/не поддерживает отключение reasoning/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Модель' }), { target: { value: 'other' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Температура' }), { target: { value: '0.8' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Reasoning' }), { target: { value: 'high' } });
    expect(setters.model).toHaveBeenCalledWith('other');
    expect(setters.temperature).toHaveBeenCalledWith('0.8');
    expect(setters.reasoning).toHaveBeenCalledWith('high');
    expect(screen.getByRole('listitem', { name: 'AI-анализ: выполняется' })).toHaveAttribute('aria-current', 'step');
  });

  test('renders active and background job panels with callbacks', () => {
    const onCancel = vi.fn();
    const onBackground = vi.fn();
    const onOpen = vi.fn();
    render(<div><ActiveJobPanel job={{ type: 'OTHER', mode: 'UNKNOWN', status: 'RUNNING', progress: 0, message: 'Ожидаем', startedAt: new Date().toISOString() }} onCancel={onCancel} onBackground={onBackground} /><BackgroundJobIndicator job={{ status: 'RUNNING', progress: 10, message: null }} onOpen={onOpen} /></div>);
    expect(screen.getByText('AI-задача')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить в фоне' }));
    fireEvent.click(screen.getByRole('button', { name: /Отменить/ }));
    fireEvent.click(screen.getByRole('button', { name: /Фоновая задача:/ }));
    expect(onBackground).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalled();
  });

  test('covers Debug loading errors, lazy details, pagination and keyboard focus trap', async () => {
    const now = new Date().toISOString();
    apiMocks.getJobTrace
      .mockResolvedValueOnce({
        jobId: 'job', status: 'SUCCEEDED', currentStep: null, createdAt: null, durationMs: 1500,
        timeline: [
          { id: 'available', source: 'TRACE', category: 'worker', name: 'Доступная деталь', status: 'COMPLETED', startedAt: now, durationMs: 10, detail: { state: 'AVAILABLE' } },
          { id: 'error-detail', source: 'TRACE', category: 'worker', name: 'Ошибка детали', status: 'FAILED', startedAt: now, durationMs: null, detail: { state: 'AVAILABLE' } },
          { id: 'expired', source: 'TRACE', category: 'worker', name: 'Истёкшая деталь', status: 'INFO', startedAt: now, durationMs: 0, detail: { state: 'EXPIRED' } },
          { id: 'redacted', source: 'TRACE', category: 'worker', name: 'Скрытая деталь', status: 'INFO', startedAt: now, durationMs: 0, detail: { state: 'REDACTED' } },
        ],
        nextCursor: 'next-page',
      })
      .mockResolvedValueOnce({ jobId: 'job', status: 'SUCCEEDED', timeline: [{ id: 'paged', source: 'TRACE', category: 'worker', name: 'Следующая страница', status: 'PENDING', startedAt: now, durationMs: 2, detail: { state: 'NOT_RECORDED' } }], nextCursor: null });
    apiMocks.getJobTraceDetail.mockResolvedValueOnce({ state: 'AVAILABLE', content: { ok: true } }).mockRejectedValueOnce({ status: 403 });
    const onClose = vi.fn();
    const onDownload = vi.fn();
    render(<DebugPanel open jobId="job" observations={[{ timestamp: now, type: 'disconnected' }]} refreshKey={0} onClose={onClose} onDownload={onDownload} triggerRef={{ current: null }} />);
    const dialog = await screen.findByRole('dialog', { name: 'Журнал задачи' });
    expect(screen.queryByText('События пока не записаны')).not.toBeInTheDocument();
    expect(screen.getByText(/Связь с сервером прервалась/)).toBeVisible();
    const available = (await screen.findByText('Доступная деталь')).closest('button');
    fireEvent.click(available);
    await waitFor(() => expect(screen.getByText(/"ok": true/)).toBeInTheDocument());
    fireEvent.click(available);
    fireEvent.click(available);
    await waitFor(() => expect(apiMocks.getJobTraceDetail).toHaveBeenCalledTimes(1));
    const errorDetail = screen.getByText('Ошибка детали').closest('button');
    fireEvent.click(errorDetail);
    await waitFor(() => expect(screen.getByText(/Нет доступа/)).toBeInTheDocument());
    const expired = screen.getByText('Истёкшая деталь').closest('button');
    fireEvent.click(expired);
    await waitFor(() => {
      expect(expired).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/срок хранения истёк/)).toBeInTheDocument();
    });
    const redacted = screen.getByText('Скрытая деталь').closest('button');
    fireEvent.click(redacted);
    await waitFor(() => expect(redacted).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText(/скрыты политикой доступа/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать результат JSON' }));
    expect(onDownload).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить ещё' }));
    await screen.findByText('Следующая страница');
    const controls = within(dialog.querySelector('aside')).getAllByRole('button');
    controls.at(-1).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(controls[0]).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(controls.at(-1)).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    cleanup();

    apiMocks.getJobTrace.mockRejectedValueOnce({ status: 403 });
    render(<DebugPanel open jobId="job" observations={[]} refreshKey={0} onClose={onClose} triggerRef={{ current: null }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа');
    cleanup();
    apiMocks.getJobTrace.mockClear();
    render(<DebugPanel open jobId={null} observations={[]} refreshKey={0} onClose={onClose} triggerRef={{ current: null }} />);
    expect(screen.getByText('События пока не записаны.')).toBeInTheDocument();
    expect(apiMocks.getJobTrace).not.toHaveBeenCalled();
  });

  test('distinguishes a successful retry from browser disconnection and copies only a safe summary', async () => {
    const writeText = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('clipboard denied'));
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const events = [
        { id: 'first', source: 'TRACE', name: 'BABOK audit rejected', category: 'VALIDATION', status: 'FAILED', startedAt: '2026-11-18T10:00:00Z',
          metadata: { issues: [{ key: 'FR-007', code: 'NON_ATOMIC' }], prompt: 'private payload' } },
        { id: 'second', source: 'TRACE', name: 'BABOK audit accepted', category: 'VALIDATION', status: 'SUCCEEDED', startedAt: '2026-11-18T10:00:02Z' },
      ];
      apiMocks.getJobTrace.mockResolvedValue({
        jobId: 'diagnostic-id', status: 'SUCCEEDED', outcome: 'COMPLETE', durationMs: 2000, timeline: events, nextCursor: null,
        instructionProfile: { version: '2.17.0' }, executionSummary: { stages: [{
          stage: 'audit', status: 'completed_after_retry', attemptCount: 2, issues: [{ key: 'FR-007', code: 'NON_ATOMIC' }],
          attempts: [{ id: 'first', status: 'rejected', model: 'glm-5.3-flash', reasonCode: 'NON_ATOMIC' }, { id: 'second', status: 'accepted', model: 'glm-5.3-flash' }],
        }] },
      });
      render(<DebugPanel open jobId="diagnostic-id" observations={[{ type: 'disconnected', timestamp: '2026-11-18T10:00:05Z' }]} onClose={vi.fn()} />);
      const rejected = await screen.findByRole('button', { name: /Ответ независимой проверки отклонён/ });
      const entries = within(screen.getByRole('list', { name: 'Хронология выполнения задачи' })).getAllByRole('listitem');
      expect(entries[0]).toHaveTextContent('В одной формулировке могут быть объединены несколько требований.');
      expect(entries[1]).toHaveTextContent('Независимая проверка пройдена');
      expect(entries[2]).toHaveTextContent(/Связь с сервером прервалась.+текущая вкладка/);
      fireEvent.click(rejected);
      expect(screen.getByText('BABOK audit rejected')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Скопировать для поддержки' }));
      expect(await screen.findByText('Сведения скопированы.')).toBeVisible();
      const [support] = writeText.mock.calls[0];
      expect(support).toMatch(/diagnostic-id[\s\S]+NON_ATOMIC[\s\S]+glm-5\.3-flash[\s\S]+2\.17\.0/);
      expect(support).not.toMatch(/private payload|BABOK audit rejected/);
      fireEvent.click(screen.getByRole('button', { name: 'Скопировать для поддержки' }));
      expect(await screen.findByRole('textbox', { name: 'Сводка для ручного копирования' })).toHaveValue(support);
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else delete navigator.clipboard;
    }
  });

  test.each([
    ['FAILED', 'Не удалось завершить задачу'],
    ['CANCELLED', 'Задача отменена'],
    ['CANCEL_REQUESTED', 'Отменяем задачу…'],
    ['RETRY_WAIT', 'Повторяем проблемный этап…'],
    ['PENDING', 'Задача ожидает запуска…'],
  ])('renders exceptional job state %s', (status, title) => {
    render(<JobStateCard job={{ status, type: 'DECOMPOSITION', reasonCode: 'OTHER' }} onCancel={vi.fn()} />);
    expect(screen.getByText(title)).toBeInTheDocument();
    if (status === 'FAILED') expect(screen.getByText('Попробуйте запустить задачу ещё раз.')).toBeInTheDocument();
    if (status === 'CANCELLED') expect(screen.getByText('Можно сформировать требования повторно.')).toBeInTheDocument();
    if (status === 'CANCEL_REQUESTED' || status === 'PENDING') expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
    cleanup();
  });

  test('renders archived partial results and downloads an available artifact', () => {
    const onDownload = vi.fn();
    render(<ArchivedLegacyResult job={{ mode: 'STANDARD_RESEARCH', createdAt: new Date().toISOString(), message: 'Архив' }} result={{ outcome: 'PARTIAL', summary: 'Частичная сводка' }} onDownload={onDownload} />);
    expect(screen.getByText('Готово частично')).toBeInTheDocument();
    expect(screen.getByText('Частичная сводка')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать артефакт' }));
    expect(onDownload).toHaveBeenCalled();
  });

  test('keeps unsaved navigation focus trapped and closes only when allowed', () => {
    const callbacks = { save: vi.fn(), discard: vi.fn(), stay: vi.fn() };
    render(<UnsavedNavigationDialog busy={false} onSave={callbacks.save} onDiscard={callbacks.discard} onStay={callbacks.stay} />);
    const dialog = screen.getByRole('dialog', { name: 'Несохранённые изменения' });
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(buttons.at(-1)).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(callbacks.stay).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и перейти' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отбросить и перейти' }));
    expect(callbacks.save).toHaveBeenCalled();
    expect(callbacks.discard).toHaveBeenCalled();
    cleanup();
    render(<UnsavedNavigationDialog busy onSave={callbacks.save} onDiscard={callbacks.discard} onStay={callbacks.stay} />);
    const busyDialog = screen.getByRole('dialog', { name: 'Несохранённые изменения' });
    fireEvent.keyDown(busyDialog, { key: 'Escape' });
    expect(callbacks.stay).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Сохранить и перейти' })).toBeDisabled();
  });
});

 test.each([undefined, []])('does not manufacture BABOK requirements from analysis when enhancements are %s', (enhancements) => {
  const registry = roomBookingRegistry();
  const value = { mode: 'REQUIREMENTS_INSIGHTS', baseRegistry: registry, insights: [{ id: 'analysis-only', category: 'trends', title: 'Отраслевая практика', summary: 'Банки консолидируют программы', enhancements }] };
  render(<SessionContext.Provider value={{ view: 'insights', requestView: vi.fn() }}><BabokRequirementsInsightsResult value={value} latestVersion={{ registry, decisions: {} }} onSaveFinal={vi.fn()} onDirtyChange={vi.fn()} /></SessionContext.Provider>);
  expect(screen.getByText('Банки консолидируют программы')).toBeVisible();
  expect(screen.getByText('В этом результате AI не предложил готовых требований для добавления в реестр.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Принять улучшение:/ })).not.toBeInTheDocument();
});
