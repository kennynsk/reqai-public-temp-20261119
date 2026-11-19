// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ContextInput from './ContextInput.jsx';

afterEach(cleanup);

function renderInput(overrides = {}) {
  const props = {
    text: 'Контекст',
    onText: vi.fn(),
    file: null,
    onFile: vi.fn(),
    baseline: null,
    onBaseline: vi.fn(),
    references: [],
    onReferences: vi.fn(),
    uploads: new Map(),
    busy: false,
    integrationAvailable: true,
    maxBytes: 10,
    ...overrides,
  };
  render(<ContextInput {...props} />);
  fireEvent.click(screen.getByText('Приложить материалы'));
  return props;
}

test('validates file sizes and renders upload, error, progress, and ready states', () => {
  const primary = new File(['ok'], 'primary.txt');
  const baseline = new File(['base'], 'baseline.txt');
  const reference = new File(['ref'], 'reference.txt');
  const waiting = new File(['wait'], 'waiting.txt');
  const onFile = vi.fn();
  const onBaseline = vi.fn();
  const onReferences = vi.fn();
  const uploads = new Map([
    [primary, { artifactId: 'artifact-primary' }],
    [baseline, { error: 'failed' }],
    [reference, { progress: 0.42 }],
  ]);
  const props = renderInput({ file: primary, onFile, baseline, onBaseline, references: [reference, waiting], onReferences, uploads });

  expect(screen.getByText(/Основной источник — приложенный файл/)).toBeInTheDocument();
  expect(screen.getByText('Загружен')).toBeInTheDocument();
  expect(screen.getByText('Ошибка загрузки — повторите запуск')).toBeInTheDocument();
  expect(screen.getByText('Загрузка 42%')).toBeInTheDocument();
  expect(screen.getByText('Готов к загрузке')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Убрать primary.txt' }));
  expect(onFile).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: 'Убрать baseline.txt' }));
  expect(onBaseline).toHaveBeenCalledWith(null);
  fireEvent.change(screen.getByLabelText('Предыдущая версия требований'), { target: { files: [baseline] } });
  expect(onBaseline).toHaveBeenCalledWith(baseline);
  fireEvent.change(screen.getByLabelText('Файл требований'), { target: { files: [new File([], 'empty.txt'), primary] } });
  expect(onFile).toHaveBeenCalledWith(primary);
  expect(screen.getByRole('alert')).toHaveTextContent('непустой файл TXT, Markdown или JSON');

  fireEvent.click(screen.getByRole('button', { name: 'Убрать waiting.txt' }));
  expect(onReferences).toHaveBeenCalledWith([reference]);
  expect(props.onText).not.toHaveBeenCalled();
});

test('limits reference materials and supports the integration-unavailable state', () => {
  const references = Array.from({ length: 20 }, (_, index) => new File([String(index)], `ref-${index}.txt`));
  const onReferences = vi.fn();
  renderInput({ references, onReferences });
  fireEvent.change(screen.getByLabelText('Справочные материалы'), { target: { files: [new File(['new'], 'new.txt')] } });

  expect(screen.getByRole('alert')).toHaveTextContent('не более 20');
  expect(onReferences).toHaveBeenCalledWith(references);

  cleanup();
  renderInput({ integrationAvailable: false });
  expect(screen.getByText(/Дополнительные роли материалов недоступны/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Предыдущая версия требований')).not.toBeInTheDocument();
});

test('disables text and attachment controls while busy', () => {
  const file = new File(['draft'], 'draft.txt');
  renderInput({ busy: true, file });

  expect(screen.getByRole('textbox', { name: 'Бизнес-контекст' })).toBeDisabled();
  expect(screen.getByLabelText('Файл требований')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Убрать draft.txt' })).toBeDisabled();
});

test('ignores empty selections for single-file inputs', () => {
  const onFile = vi.fn();
  const onBaseline = vi.fn();
  renderInput({ onFile, onBaseline });

  fireEvent.change(screen.getByLabelText('Файл требований'), { target: { files: [] } });
  fireEvent.change(screen.getByLabelText('Предыдущая версия требований'), { target: { files: [] } });

  expect(onFile).not.toHaveBeenCalled();
  expect(onBaseline).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
