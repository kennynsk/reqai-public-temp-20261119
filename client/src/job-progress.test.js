import { expect, test } from 'vitest';
import { executionPhaseIndex, focusMessageForJob, isModelPhase, progressAriaText, progressPresentationForJob, visualProgressForJob } from './job-progress.js';

test('model progress moves from the server milestone without crossing assembly', () => {
  const job = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, updatedAt: '2026-08-28T12:00:00Z' };
  const phaseStart = Date.parse(job.updatedAt);
  expect(visualProgressForJob(job, phaseStart)).toBe(20);
  expect(visualProgressForJob(job, phaseStart + 60_000)).toBeGreaterThan(20);
  expect(visualProgressForJob(job, phaseStart + 60_000)).toBeLessThan(70);
  expect(visualProgressForJob(job, phaseStart + 60 * 60_000)).toBeLessThan(70);
  expect(focusMessageForJob(job, 0)).toBe(focusMessageForJob(job, Date.now() + 3600000));
  expect(progressPresentationForJob(job, phaseStart)).toMatchObject({ estimated: true, progress: 20, stageLabel: 'AI-анализ' });
});

test('late decomposition phases move inside bounded ranges and terminal success stays authoritative', () => {
  expect(executionPhaseIndex({ progress: 99, currentStep: 'unknown' })).toBe(-1);
  expect(executionPhaseIndex({ progress: 20, currentStep: 'assembly' })).toBe(2);
  const phaseStart = Date.parse('2026-08-28T12:00:00Z');
  const assembly = { type: 'DECOMPOSITION', status: 'RUNNING', progress: 70, currentStep: 'assembly', updatedAt: '2026-08-28T12:00:00Z' };
  const persistence = { type: 'DECOMPOSITION', status: 'RUNNING', progress: 90, currentStep: 'persistence', updatedAt: '2026-08-28T12:00:00Z' };
  expect(progressPresentationForJob(assembly, phaseStart + 60_000)).toMatchObject({ estimated: true, progress: 89, stageLabel: 'Сборка' });
  expect(progressPresentationForJob(persistence, phaseStart + 60_000)).toMatchObject({ estimated: true, progress: 99, stageLabel: 'Сохранение' });
  expect(progressPresentationForJob({ status: 'SUCCEEDED', progress: 100, currentStep: 'persistence' }, phaseStart + 60_000)).toMatchObject({ estimated: false, progress: 100, stageLabel: 'Сохранение' });
  expect(progressAriaText({ progress: 94, stageLabel: 'Сборка', estimated: true })).toMatch(/ориентировочная оценка/);
  expect(focusMessageForJob({ status: 'RETRY_WAIT', currentStep: 'model' })).toMatch(/повторной попытки/);
});

test('phase estimates restore from the same server timestamp after reload and never apply to research', () => {
  const decomposition = { type: 'DECOMPOSITION', status: 'RUNNING', progress: 70, currentStep: 'assembly', updatedAt: '2026-08-28T12:00:00Z' };
  const restored = progressPresentationForJob(decomposition, Date.parse('2026-08-28T12:00:12Z'));
  expect(progressPresentationForJob({ ...decomposition }, Date.parse('2026-08-28T12:00:12Z'))).toEqual(restored);
  expect(progressPresentationForJob({ type: 'RESEARCH', status: 'RUNNING', progress: 20, currentStep: 'requirements-insights', updatedAt: decomposition.updatedAt }, Date.parse('2026-08-28T12:10:00Z'))).toMatchObject({ estimated: false, progress: 20 });
});

test('normalizes progress, timestamps, and all focus messages at phase boundaries', () => {
  expect(isModelPhase({ currentStep: 'model' })).toBe(true);
  expect(isModelPhase({ currentStep: 'validation' })).toBe(false);
  expect(progressPresentationForJob({ status: 'RUNNING', currentStep: 'model', progress: 250 })).toMatchObject({ estimated: false, progress: 100 });
  expect(progressPresentationForJob({ status: 'RUNNING', currentStep: 'model', progress: -10 })).toMatchObject({ estimated: false, progress: 0 });

  const start = new Date(Date.now() - 1000);
  expect(visualProgressForJob({ type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, createdAt: start }, 'not-a-date')).toBeGreaterThan(20);
  expect(visualProgressForJob({ type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt: start.getTime() }, Date.now())).toBeGreaterThan(20);
  expect(visualProgressForJob({ type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20 }, Date.now())).toBeGreaterThanOrEqual(20);

  expect(focusMessageForJob({ status: 'ACCEPTED', currentStep: 'validation' })).toMatch(/принята/);
  expect(focusMessageForJob({ status: 'QUEUED', currentStep: 'validation' })).toMatch(/принята/);
  expect(focusMessageForJob({ type: 'RESEARCH', status: 'RUNNING', currentStep: 'requirements-insights' })).toMatch(/исследует требования/);
  expect(focusMessageForJob({ status: 'RUNNING', currentStep: 'validation' })).toMatch(/Подготавливаем материалы/);
  expect(focusMessageForJob({ status: 'RUNNING', currentStep: 'unknown' })).toMatch(/Ожидаем обновления/);
  expect(progressAriaText({ progress: 50, stageLabel: null, estimated: false })).toBe('50 процентов подтверждено сервером');
  expect(progressAriaText({ progress: 50, stageLabel: null, estimated: true })).toMatch(/этапа выполнения/);
});
