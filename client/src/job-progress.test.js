import { describe, expect, test } from 'vitest';

import { executionPhaseIndex, focusMessageForJob, visualProgressForJob } from './job-progress.js';

const startedAt = '2026-08-15T12:00:00.000Z';
const start = Date.parse(startedAt);

describe('living job progress', () => {
  test('moves monotonically during decomposition but remains below the confirmed assembly boundary', () => {
    const job = { type: 'DECOMPOSITION', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    const samples = [0, 30_000, 60_000, 100_000, 10 * 60_000].map((elapsed) => visualProgressForJob(job, start + elapsed));
    expect(samples[0]).toBe(20);
    expect(samples[1]).toBeGreaterThan(40);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(samples.at(-1)).toBeLessThan(90);
  });

  test('restores the same estimate from timing data and yields to authoritative phase changes', () => {
    const running = { type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    expect(visualProgressForJob(running, start + 120_000)).toBe(visualProgressForJob({ ...running }, start + 120_000));
    expect(visualProgressForJob({ ...running, currentStep: 'assembly', progress: 90 }, start + 120_000)).toBe(90);
    expect(visualProgressForJob({ ...running, status: 'SUCCEEDED', currentStep: 'persistence', progress: 100 }, start + 120_000)).toBe(100);
  });

  test('rotates workflow-specific focus messages without advancing the confirmed phase', () => {
    const job = { type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS', status: 'RUNNING', currentStep: 'model', progress: 20, startedAt };
    expect(focusMessageForJob(job, start)).toBe('Сопоставляем требования с отраслевыми практиками');
    expect(focusMessageForJob(job, start + 15_000)).toBe('Ищем подходящие архитектурные паттерны');
    expect(executionPhaseIndex(job)).toBe(1);
    expect(executionPhaseIndex({ ...job, currentStep: 'assembly', progress: 90 })).toBe(2);
  });
});
