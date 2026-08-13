import { randomUUID } from 'node:crypto';

import { logEvent } from '../middleware/safe-logging.js';
import { classifyProviderError, ProviderError } from '../provider/provider-error.js';
import { injectTrace } from '../observability/telemetry.js';
import { increment } from '../observability/metrics.js';

export function validateModelPolicy(policy) {
  if (!Array.isArray(policy.models) || policy.models.length < 1 || policy.models.length > 3 || new Set(policy.models).size !== policy.models.length) throw new Error('Model policy requires 1 to 3 distinct models');
  if (!Number.isInteger(policy.maxAttemptsPerModel) || policy.maxAttemptsPerModel < 1 || policy.maxAttemptsPerModel > 2) throw new Error('Model policy allows at most two attempts per model');
  return Object.freeze({ ...policy, models: Object.freeze([...policy.models]) });
}

export function createModelExecutor({ provider, coordination, attempts, jobTraceRepository, diagnosticCapture, clock = () => new Date(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), uuid = randomUUID }) {
  const trace = (input) => jobTraceRepository?.append(input).catch((error) => logEvent('warn', 'job.trace.append.failed', { jobId: input.jobId, category: input.category, errorType: error?.name || 'Error' }));
  return {
    async execute({ tenantId, ownerUserId, jobId, stepId, messages, policy, deadlineAt, executionSite, temperature }) {
      const snapshot = validateModelPolicy(policy);
      const requestedModel = snapshot.models[0];
      const history = [];
      await diagnosticCapture?.capture({ tenantId, ownerUserId, jobId, stepId, category: 'INSTRUCTIONS', name: 'LLM prompt captured', kind: 'PROMPT', content: { messages: messages.map(({ role, content }) => ({ role, text: content })) } });
      for (const model of snapshot.models) {
        for (let attempt = 1; attempt <= snapshot.maxAttemptsPerModel; attempt += 1) {
          if (clock().getTime() >= new Date(deadlineAt).getTime()) throw new ProviderError('Job deadline expired', { reasonCode: 'JOB_DEADLINE_EXPIRED' });
          const lease = await coordination.acquire({ tenantId, model, limit: snapshot.maxConcurrency[model], leaseMs: snapshot.requestTimeoutMs + 30_000 });
          if (!lease) { history.push({ model, attempt, reasonCode: 'MODEL_CAPACITY_WAIT' }); await sleep(Math.min(snapshot.retryMaxDelayMs, snapshot.retryInitialDelayMs)); attempt -= 1; continue; }
          const attemptId = uuid();
          let persistedAttemptId = attemptId;
          const started = clock();
          await trace({ tenantId, jobId, category: 'MODEL', name: `LLM attempt: ${model}`, status: 'RUNNING', stepId, startedAt: started, metadata: { requestedModel, actualModel: model, attempt, temperature, requestTimeoutMs: snapshot.requestTimeoutMs } });
          try {
            const persistedAttempt = await attempts.start({ id: attemptId, tenantId, jobId, stepId, attempt, requestedModel, actualModel: model, executionSite });
            persistedAttemptId = persistedAttempt?.id || attemptId;
          } catch (error) {
            await coordination.release?.({ tenantId, model, leaseId: lease.id });
            throw error;
          }
          let response;
          try {
            response = await provider.complete({ model, messages, temperature, timeoutMs: snapshot.requestTimeoutMs, traceContext: injectTrace({}) });
          } catch (rawError) {
            const error = classifyProviderError(rawError);
            await coordination.failure({ tenantId, model, leaseId: lease.id, reasonCode: error.reasonCode });
            await attempts.finish({ id: persistedAttemptId, tenantId, status: 'FAILED', reasonCode: error.reasonCode, durationMs: clock() - started });
            await trace({ tenantId, jobId, category: 'ERROR', name: `LLM attempt failed: ${model}`, status: 'FAILED', stepId, startedAt: started, completedAt: clock(), durationMs: clock() - started, metadata: { requestedModel, actualModel: model, attempt, reasonCode: error.reasonCode } });
            await diagnosticCapture?.capture({ tenantId, ownerUserId, jobId, stepId, category: 'ERROR', name: 'LLM error detail captured', kind: 'ERROR_STACK', visibility: 'SYSTEM_ADMIN', content: { errorType: error.name, reasonCode: error.reasonCode, stack: error.stack } });
            history.push({ model, attempt, reasonCode: error.reasonCode });
            increment('reqai_llm_attempts_total', { model, status: 'failed', reasonCode: error.reasonCode });
            if (error.reasonCode === 'UNKNOWN_PROVIDER_ERROR') logEvent('error', 'provider.unknown-error', { jobId, stepId, model, reasonCode: error.reasonCode });
            if (!error.retryable) throw Object.assign(error, { history });
            if (attempt < snapshot.maxAttemptsPerModel) {
              const delay = Math.min(snapshot.retryMaxDelayMs, snapshot.retryInitialDelayMs * (2 ** (attempt - 1)));
              await trace({ tenantId, jobId, category: 'RETRY', name: 'LLM retry scheduled', status: 'INFO', stepId, startedAt: clock(), completedAt: clock(), durationMs: 0, metadata: { model, attempt, delayMs: delay, reasonCode: error.reasonCode } });
              if (clock().getTime() + delay >= new Date(deadlineAt).getTime()) throw new ProviderError('Job deadline expired', { reasonCode: 'JOB_DEADLINE_EXPIRED' });
              await sleep(delay);
            }
            continue;
          }
          try {
            await coordination.success({ tenantId, model, leaseId: lease.id });
            await attempts.finish({ id: persistedAttemptId, tenantId, status: 'SUCCEEDED', providerRequestId: response.requestId, usage: response.usage, durationMs: clock() - started });
            await trace({ tenantId, jobId, category: 'MODEL', name: `LLM attempt completed: ${model}`, status: 'COMPLETED', stepId, startedAt: started, completedAt: clock(), durationMs: clock() - started, metadata: { requestedModel, actualModel: model, attempt, providerRequestId: response.requestId, tokenUsage: response.usage, fallbackApplied: model !== requestedModel, temperature } });
            await diagnosticCapture?.capture({ tenantId, ownerUserId, jobId, stepId, category: 'MODEL', name: 'LLM output captured', kind: 'OUTPUT', content: { text: response.text, requestId: response.requestId, usage: response.usage } });
            increment('reqai_llm_attempts_total', { model, status: 'succeeded' });
            if (model !== requestedModel) increment('reqai_llm_fallback_total', { requestedModel, actualModel: model });
            return { ...response, requestedModel, actualModel: model, fallbackApplied: model !== requestedModel, history };
          } catch (error) {
            await coordination.release?.({ tenantId, model, leaseId: lease.id });
            throw error;
          }
        }
      }
      throw Object.assign(new ProviderError('All configured models failed', { reasonCode: 'MODEL_FALLBACK_EXHAUSTED' }), { history });
    },
  };
}
