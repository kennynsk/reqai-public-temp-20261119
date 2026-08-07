import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { Client, Connection, WorkflowIdConflictPolicy } from '@temporalio/client';

import { assertWorkflowEngine, workflowIdForJob } from './workflow-engine.js';

export async function temporalTlsOptions(config) {
  if (!config.temporal.tls.enabled) return undefined;
  const [crt, key] = await Promise.all([
    readFile(config.temporal.tls.certPath),
    readFile(config.temporal.tls.keyPath),
  ]);
  return {
    clientCertPair: { crt, key },
    ...(config.temporal.tls.serverName ? { serverNameOverride: config.temporal.tls.serverName } : {}),
  };
}

export class TemporalWorkflowEngine {
  constructor({ client, connection, namespace, taskQueues }) {
    this.client = client;
    this.connection = connection;
    this.namespace = namespace;
    this.taskQueues = taskQueues;
  }

  async start({ jobId, type, input, idempotencyKey }) {
    const workflowId = workflowIdForJob(jobId);
    const workflowType = type === 'RESEARCH' ? 'researchWorkflow' : 'decompositionWorkflow';
    const taskQueue = type === 'RESEARCH' ? this.taskQueues.research : this.taskQueues.decomposition;
    const handle = await this.client.workflow.start(workflowType, {
      workflowId,
      taskQueue,
      args: [input],
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      staticSummary: `ReqAI ${type.toLowerCase()} job`,
      memo: { jobId, idempotencyKey },
    });
    return { executionId: jobId, workflowId, runId: handle.firstExecutionRunId };
  }

  async signal({ executionId, signal, payload }) {
    await this.client.workflow.getHandle(workflowIdForJob(executionId)).signal(signal, payload);
  }

  async cancel({ executionId }) {
    await this.client.workflow.getHandle(workflowIdForJob(executionId)).cancel();
  }

  async retry({ executionId, reason }) {
    await this.signal({ executionId, signal: 'retryRequested', payload: { reason } });
  }

  async reset({ executionId, runId, workflowTaskFinishEventId, reason, requestId = randomUUID() }) {
    const response = await this.connection.workflowService.resetWorkflowExecution({
      namespace: this.namespace,
      workflowExecution: { workflowId: workflowIdForJob(executionId), runId },
      workflowTaskFinishEventId,
      reason,
      requestId,
      resetReapplyType: 1,
    });
    return { executionId, runId: response.runId };
  }

  async getExecution({ executionId, runId }) {
    const description = await this.client.workflow.getHandle(workflowIdForJob(executionId), runId).describe();
    return {
      executionId,
      runId: description.runId,
      status: description.status?.name || String(description.status),
      taskQueue: description.taskQueue,
      startTime: description.startTime,
      closeTime: description.closeTime,
    };
  }

  async close() {
    await this.connection.close();
  }
}

export async function createTemporalWorkflowEngine(config, { ConnectionClass = Connection, ClientClass = Client } = {}) {
  const connection = await ConnectionClass.connect({ address: config.temporal.address, tls: await temporalTlsOptions(config) });
  const client = new ClientClass({ connection, namespace: config.temporal.namespace, identity: config.temporal.identity });
  return assertWorkflowEngine(new TemporalWorkflowEngine({
    client,
    connection,
    namespace: config.temporal.namespace,
    taskQueues: config.temporal.taskQueues,
  }));
}
