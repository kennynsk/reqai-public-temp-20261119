// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import ResultSettings from './ResultSettings.jsx';

afterEach(cleanup);

test('shows saved settings and only successful models that returned the result', () => {
  render(<ResultSettings result={{
    executionSettings: { requestedModel: 'glm-5.3', effectiveReasoning: 'high', requestedReasoning: 'max', temperature: 0.2 },
    modelAttempts: [
      { result: 'SUCCEEDED', model: 'glm-5.3' },
      { result: 'SUCCEEDED', model: 'glm-5.3' },
      { result: 'FAILED', model: 'fallback-model' },
      { result: 'SUCCEEDED', model: '' },
    ],
  }} />);

  expect(screen.getByText('Запрошенная модель: glm-5.3')).toBeInTheDocument();
  expect(screen.getByText('Reasoning при запуске: высокий (приведён к поддерживаемому уровню)')).toBeInTheDocument();
  expect(screen.getByText('Температура: 0.2')).toBeInTheDocument();
  expect(screen.getByText('Модель, вернувшая результат: glm-5.3')).toBeInTheDocument();
  expect(screen.queryByText(/fallback-model/)).not.toBeInTheDocument();
});

test('explains legacy results and unknown reasoning without attempts', () => {
  render(<ResultSettings result={{ executionSettings: { requestedModel: 'legacy', effectiveReasoning: 'unknown', requestedReasoning: 'unknown', temperature: 0.7 } }} />);

  expect(screen.getByText('Reasoning при запуске: не указан')).toBeInTheDocument();

  cleanup();
  render(<ResultSettings result={{ modelAttempts: [] }} />);
  expect(screen.getByText('Для этого старого результата снимок настроек не сохранён.')).toBeInTheDocument();
});
