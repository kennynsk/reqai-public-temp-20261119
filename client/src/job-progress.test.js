import { describe, expect, test } from 'vitest';

import { executionPhaseIndex, focusMessageForJob, progressPresentationForJob, visualProgressForJob } from './job-progress.js';

const startedAt = '2026-08-15T12:00:00.000Z';
const start = Date.parse(startedAt);

describe('living job progress', () => {
  test('moves monotonically during decomposition but remains below the confirmed assembly boundary', () => {
    const job = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    const samples = [0, 2 * 60_000, 5 * 60_000, 8 * 60_000, 10 * 60_000].map((elapsed) => visualProgressForJob(job, start + elapsed));
    expect(samples[0]).toBe(20);
    expect(samples[1]).toBeGreaterThan(40);
    expect(samples[2]).toBeGreaterThan(60);
    expect(samples[2]).toBeLessThan(80);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(samples.at(-1)).toBeLessThan(90);
  });

  test('restores the same estimate from timing data and yields to authoritative phase changes', () => {
    const running = { type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    expect(visualProgressForJob(running, start + 120_000)).toBe(visualProgressForJob({ ...running }, start + 120_000));
    const assembly = visualProgressForJob({ ...running, currentStep: 'assembly', progress: 90 }, start + 120_000);
    expect(assembly).toBeGreaterThan(90);
    expect(assembly).toBeLessThan(94);
    expect(visualProgressForJob({ ...running, status: 'SUCCEEDED', currentStep: 'persistence', progress: 100 }, start + 120_000)).toBe(100);
  });

  test('keeps a stable bounded percentage through assembly, persistence and terminal success', () => {
    const assemblyJob = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'assembly', progress: 90, startedAt, updatedAt: startedAt };
    const assemblySamples = [0, 30_000, 120_000].map((elapsed) => progressPresentationForJob(assemblyJob, start + elapsed));
    expect(assemblySamples[0]).toMatchObject({ estimated: false, progress: 90, stageLabel: 'Сборка', visualProgress: 90 });
    expect(assemblySamples[1].progress).toBeGreaterThan(90);
    expect(assemblySamples.at(-1).visualProgress).toBeLessThan(94);
    expect(progressPresentationForJob({ ...assemblyJob }, start + 30_000)).toEqual(assemblySamples[1]);

    const persistenceJob = { ...assemblyJob, currentStep: 'persistence', progress: 95 };
    const persistence = progressPresentationForJob(persistenceJob, start + 60_000);
    expect(persistence.estimated).toBe(true);
    expect(persistence.progress).toBeGreaterThan(95);
    expect(persistence.visualProgress).toBeLessThan(99);

    const succeeded = progressPresentationForJob({ ...persistenceJob, status: 'SUCCEEDED', progress: 100 }, start + 120_000);
    expect(succeeded).toMatchObject({ estimated: false, progress: 100, stageLabel: 'Сохранение', visualProgress: 100 });
  });

  test('rotates workflow-specific focus messages without advancing the confirmed phase', () => {
    const job = { type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    expect(focusMessageForJob(job, start)).toBe('Сопоставляем требования с отраслевыми практиками');
    expect(focusMessageForJob(job, start + 15_000)).toBe('Ищем подходящие архитектурные паттерны');
    expect(executionPhaseIndex(job)).toBe(1);
    expect(executionPhaseIndex({ ...job, currentStep: 'assembly', progress: 90 })).toBe(2);
  });

  test('uses BABOK-focused messages during decomposition', () => {
    const job = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    expect(focusMessageForJob(job, start)).toBe('Анализируем цели и ограничения');
    expect(focusMessageForJob(job, start + 15_000)).toBe('Выделяем контекст и границы решения');
    expect(focusMessageForJob(job, start + 135_000)).toBe('Формируем вопросы для уточнения');
  });

  test('shows consolidation guidance during assembly and persistence', () => {
    const assembly = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'assembly', progress: 90, startedAt };
    expect(focusMessageForJob(assembly, start)).toBe('Объединяем результаты анализа');
    expect(focusMessageForJob(assembly, start + 15_000)).toBe('Сверяем требования между частями задачи');
    expect(focusMessageForJob(assembly, start + 75_000)).toBe('Формируем единый реестр требований');

    const persistence = { ...assembly, currentStep: 'persistence', progress: 95 };
    expect(focusMessageForJob(persistence, start)).toBe('Проверяем итоговый реестр требований перед сохранением');
  });
});
