import { logEvent } from '../middleware/safe-logging.js';

function retryDelayMs(attempt) {
  return Math.min(60_000, 1000 * (2 ** Math.min(Math.max(attempt - 1, 0), 6)));
}

export function createWorkflowDispatcher({ repository, workflowEngine, operationalRepository, tenantId, siteId, batchSize = 20, clock = () => new Date() }) {
  return {
    async runOnce() {
      const mode = await operationalRepository?.get({ tenantId });
      if (mode && mode.mode !== 'NORMAL') return { claimed: 0, started: 0, failed: 0, pausedByMode: mode.mode };
      const now = clock();
      await repository.requeueStalled({ tenantId, staleBefore: new Date(now.getTime() - 120_000) });
      const events = await repository.claim({ tenantId, limit: batchSize });
      let started = 0;
      let failed = 0;
      for (const event of events) {
        try {
          if (!event.job) throw Object.assign(new Error('Accepted job not found'), { code: 'JOB_NOT_FOUND' });
          if (event.event_type === 'job.cancel-requested') {
            await workflowEngine.cancel({ executionId: event.job.id });
            await repository.markCancellationDispatched({ tenantId, eventId: event.event_id, jobId: event.job.id });
            started += 1;
            continue;
          }
          await workflowEngine.start({
            jobId: event.job.id,
            type: event.job.type,
            idempotencyKey: event.event_id,
            input: {
              jobId: event.job.id,
              tenantId,
              ownerUserId: event.job.owner_user_id,
              inputArtifactId: event.job.input_artifact_id,
              configurationSnapshot: event.job.configuration_snapshot,
              deadlineAt: event.job.deadline_at,
              traceContext: event.payload?.traceContext || {},
            },
          });
          await repository.markStarted({ tenantId, eventId: event.event_id, jobId: event.job.id, executionSite: siteId });
          started += 1;
        } catch (error) {
          const reasonCode = typeof error?.code === 'string' ? error.code : 'TEMPORAL_START_FAILED';
          await repository.markFailed({
            tenantId,
            eventId: event.event_id,
            reasonCode,
            retryAt: new Date(now.getTime() + retryDelayMs(event.workflow_attempts)),
          });
          logEvent('error', 'workflow.dispatch.failed', { jobId: event.job_id, reasonCode, attempt: event.workflow_attempts });
          failed += 1;
        }
      }
      return { claimed: events.length, started, failed };
    },
  };
}
