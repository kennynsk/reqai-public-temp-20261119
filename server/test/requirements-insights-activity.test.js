import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnterpriseActivityHandlers } from '../src/activities/enterprise-handlers.js';

test('requirements insights activity uses the original prompt contract and persists structured cards', async () => {
  let providerInput; let stored;
  const version = {
    kind: 'REQUIREMENTS_VERSION',
    businessContextArtifactId: 'context-artifact',
    requirements: { business: [{ id: 'BT-1', text: 'Сократить срок обработки' }], functional: [], nonfunctional: [] },
  };
  const handlers = createEnterpriseActivityHandlers({
    config: {
      process: { siteId: 'dc-a' },
      retention: { finalResultsDays: 180, intermediateDays: 30 },
      jobs: { resultMaxBytes: 104857600 },
      llm: { retryInitialDelayMs: 1, retryMaxDelayMs: 2, maxConcurrency: { 'GC-Max': 1 } },
    },
    artifactRepository: {
      async readText({ artifactId }) { return artifactId === 'version-artifact' ? JSON.stringify(version) : 'Автоматизация обработки клиентских заявок'; },
      async createText(value) { stored = value; return { artifactId: 'result-artifact' }; },
    },
    modelExecutor: {
      async execute(value) {
        providerInput = value;
        return {
          text: JSON.stringify({ insights: [{ id: 'insight-1', category: 'trends', title: 'Автоматизация', summary: 'Рынок ускоряет обработку', detail: 'Применимо к задаче.', applicability: 91, source_types: ['market_research'], relatedTo: ['BT-1'], enhancements: [{ targetType: 'functional', text: 'Система должна автоматически обрабатывать заявку' }] }] }),
          actualModel: 'GC-Max', fallbackApplied: false,
        };
      },
    },
  });
  const result = await handlers.generateRequirementsInsights({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-a', inputArtifactId: 'version-artifact', deadlineAt: '2099-01-01T00:00:00Z', traceContext: {},
    configurationSnapshot: { models: ['GC-Max'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: { 'GC-Max': 1 }, temperature: 0.3 },
  });
  const prompt = providerInput.messages.at(-1).content;
  assert.match(prompt, /Автоматизация обработки клиентских заявок/);
  assert.match(prompt, /Сократить срок обработки/);
  assert.match(prompt, /8–12/);
  const content = JSON.parse(stored.text);
  assert.equal(content.mode, 'REQUIREMENTS_INSIGHTS');
  assert.equal(content.inputRequirementsVersionId, 'version-artifact');
  assert.equal(content.insights[0].enhancements[0].targetType, 'functional');
  assert.equal(result.insightCount, 1);
  assert.equal(stored.kind, 'RESULT');
});
