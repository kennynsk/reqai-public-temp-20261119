import { expect, test } from 'vitest';
import { executionPhaseIndex, focusMessageForJob, progressPresentationForJob, visualProgressForJob } from './job-progress.js';

test('time alone never changes the confirmed percentage or work description', () => {
  const job = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt: '2026-08-28T12:00:00Z' };
  expect(visualProgressForJob(job, 0)).toBe(20);
  expect(visualProgressForJob(job, Date.now() + 3600000)).toBe(20);
  expect(focusMessageForJob(job, 0)).toBe(focusMessageForJob(job, Date.now() + 3600000));
  expect(progressPresentationForJob(job)).toMatchObject({ estimated: false, progress: 20, stageLabel: 'AI-анализ' });
});

test('only a known server milestone advances the execution phase', () => {
  expect(executionPhaseIndex({ progress: 99, currentStep: 'unknown' })).toBe(-1);
  expect(executionPhaseIndex({ progress: 20, currentStep: 'assembly' })).toBe(2);
  expect(progressPresentationForJob({ status: 'SUCCEEDED', progress: 100, currentStep: 'persistence' })).toMatchObject({ progress: 100, stageLabel: 'Сохранение' });
  expect(focusMessageForJob({ status: 'RETRY_WAIT', currentStep: 'model' })).toMatch(/повторной попытки/);
});
