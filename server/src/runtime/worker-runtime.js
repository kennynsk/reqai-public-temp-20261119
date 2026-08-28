import { fileURLToPath } from 'node:url';

import { NativeConnection, Worker } from '@temporalio/worker';
import { Kafka } from 'kafkajs';

import { logEvent } from '../middleware/safe-logging.js';
import { createDatabasePool } from '../db/pool.js';
import { WorkflowDispatchRepository } from '../repositories/workflow-dispatch-repository.js';
import { EventRepository } from '../repositories/event-repository.js';
import { WebhookRepository } from '../repositories/webhook-repository.js';
import { OperationalRepository } from '../repositories/operational-repository.js';
import { RetentionRepository } from '../repositories/retention-repository.js';
import { JobRepository } from '../repositories/job-repository.js';
import { ArtifactRepository } from '../repositories/artifact-repository.js';
import { AttemptRepository } from '../repositories/attempt-repository.js';
import { ModelCoordinationRepository } from '../repositories/model-coordination-repository.js';
import { JobTraceRepository } from '../repositories/job-trace-repository.js';
import { createWorkflowDispatcher } from '../services/workflow-dispatcher.js';
import { createKafkaOutboxPublisher } from '../services/kafka-outbox-publisher.js';
import { createWebhookDispatcher } from '../services/webhook-dispatcher.js';
import { createTemporalWorkflowEngine } from '../workflow/temporal-workflow-engine.js';
import { temporalTlsOptions } from '../workflow/temporal-workflow-engine.js';
import { createCheckpointedActivities } from '../activities/checkpointed-activities.js';
import { createEnterpriseActivityHandlers } from '../activities/enterprise-handlers.js';
import { createModelExecutor } from '../services/model-executor.js';
import { createDiagnosticCaptureService } from '../services/diagnostic-capture-service.js';
import { createGigaChatClient } from '../provider/create-gigachat-client.js';
import { GigaChatProvider } from '../provider/gigachat-provider.js';
import { ZaiProvider } from '../provider/zai-provider.js';
import { MockLlmProvider } from '../provider/mock-llm-provider.js';
import { startWorkerHealthServer } from './worker-health.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../prompts/prompt-catalog.js';
import { createBabokSkillBundleLoader, defaultBabokSkillBundleRoot, qualifyBabokSkillBundle } from '../skills/babok-skill-bundle.js';

function lifecycleShell(config) {
  const keepAlive = setInterval(() => {}, 60_000);
  return {
    role: config.process.role,
    async stop() { clearInterval(keepAlive); },
    forceStop() { clearInterval(keepAlive); },
  };
}

export async function startWorkerRuntime(config, { ConnectionClass = NativeConnection, WorkerClass = Worker, activitiesFactory = null } = {}) {
  if (config.process.role === 'maintenance-worker') {
    const health = await startWorkerHealthServer(config);
    const pool=createDatabasePool(config);const retention=new RetentionRepository(pool,{schema:config.database.schema,artifactSchema:config.database.artifactSchema});let stopping=false,inFlight=Promise.resolve();
    const poll=()=>{if(stopping)return;inFlight=inFlight.then(()=>retention.cleanup({tenantId:config.tenancy.defaultTenantId,batchSize:config.retention.cleanupBatchSize,siteId:config.process.siteId})).then(ids=>logEvent('info','retention.batch.completed',{count:ids.length})).catch(error=>logEvent('error','retention.batch.failed',{errorType:error?.name||'Error'}));};poll();const timer=setInterval(poll,config.retention.intervalMs);
    return{role:config.process.role,async stop(){stopping=true;health.beginDrain();clearInterval(timer);await inFlight;await health.close();await pool.end();},forceStop(){stopping=true;health.beginDrain();clearInterval(timer);health.close().catch(()=>{});pool.end().catch(()=>{});}};
  }
  if (config.process.role === 'event-worker') {
    const pool = createDatabasePool(config);
    const workflowEngine = await createTemporalWorkflowEngine(config);
    const repository = new WorkflowDispatchRepository(pool, { schema: config.database.schema });
    const operationalRepository = new OperationalRepository(pool, { schema: config.database.schema, siteId: config.process.siteId });
    const dispatcher = createWorkflowDispatcher({
      repository,
      workflowEngine,
      tenantId: config.tenancy.defaultTenantId,
      siteId: config.process.siteId,
      batchSize: Math.min(config.kafka.outboxBatchSize, 100),
      operationalRepository,
    });
    const kafka = new Kafka({ clientId: config.kafka.clientId, brokers: config.kafka.brokers, ssl: config.kafka.ssl, sasl: config.kafka.username ? { mechanism: config.kafka.saslMechanism, username: config.kafka.username, password: config.kafka.password } : undefined });
    const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 }); await producer.connect();
    const eventRepository = new EventRepository(pool, { schema: config.database.schema });
    const kafkaPublisher = createKafkaOutboxPublisher({ repository: eventRepository, producer, tenantId: config.tenancy.defaultTenantId, topic: config.kafka.jobEventsTopic, batchSize: config.kafka.outboxBatchSize, sourceSite: config.process.siteId });
    const webhookRepository = new WebhookRepository(pool, { schema: config.database.schema });
    const webhookDispatcher = config.webhook.enabled ? createWebhookDispatcher({ repository: webhookRepository, sender: fetch, tenantId: config.tenancy.defaultTenantId, config: config.webhook, dlqPublisher: (payload) => producer.send({ topic: config.kafka.webhookDlqTopic, messages: [{ key: payload.jobId, value: JSON.stringify(payload) }] }) }) : null;
    const health = await startWorkerHealthServer(config);
    let stopping = false;
    let inFlight = Promise.resolve();
    const poll = () => {
      if (stopping) return;
      inFlight = inFlight.then(async () => { await dispatcher.runOnce(); await kafkaPublisher.runOnce(); await webhookDispatcher?.runOnce(); }).catch((error) => {
        logEvent('error', 'workflow.dispatch.poll.failed', { errorType: error?.name || 'Error' });
      });
    };
    poll();
    const timer = setInterval(poll, config.kafka.outboxIntervalMs);
    logEvent('info', 'runtime.started', { role: config.process.role, site: config.process.siteId });
    return {
      role: config.process.role,
      async stop() {
        stopping = true;
        health.beginDrain();
        clearInterval(timer);
        await inFlight;
        await workflowEngine.close();
        await producer.disconnect();
        await health.close();
        await pool.end();
      },
      forceStop() {
        stopping = true;
        health.beginDrain();
        clearInterval(timer);
        workflowEngine.close().catch(() => {});
        producer.disconnect().catch(() => {});
        health.close().catch(() => {});
        pool.end().catch(() => {});
      },
    };
  }
  if (config.process.role !== 'workflow-worker') {
    const runtime = lifecycleShell(config);
    logEvent('info', 'runtime.started', { role: config.process.role, site: config.process.siteId });
    return runtime;
  }

  const connection = await ConnectionClass.connect({ address: config.temporal.address, tls: await temporalTlsOptions(config) });
  let pool = null;
  let activities;
  if (activitiesFactory) activities = await activitiesFactory(config);
  else {
    pool = createDatabasePool(config);
    const jobRepository = new JobRepository(pool, { schema: config.database.schema, artifactSchema: config.database.artifactSchema });
    const artifactRepository = new ArtifactRepository(pool, { schema: config.database.schema, artifactSchema: config.database.artifactSchema });
    const attempts = new AttemptRepository(pool, { schema: config.database.schema });
    const coordination = new ModelCoordinationRepository(pool, { schema: config.database.schema, siteId: config.process.siteId, failureThreshold: config.llm.circuitFailureThreshold, windowMs: config.llm.circuitWindowMs, openMs: config.llm.circuitOpenMs });
    const jobTraceRepository = new JobTraceRepository(pool, { schema: config.database.schema });
    const diagnosticCapture = createDiagnosticCaptureService({ config, artifactRepository, jobTraceRepository });
    const provider = config.llm.providerMode === 'mock'
      ? new MockLlmProvider({ delayMs: config.llm.mockDelayMs })
      : config.llm.providerMode === 'zai'
        ? new ZaiProvider({ apiKey: config.llm.apiKey, baseUrl: config.llm.baseUrl })
        : new GigaChatProvider(createGigaChatClient(config), { modelAliases: config.llm.modelAliases });
    const modelExecutor = createModelExecutor({ provider, coordination, attempts, jobTraceRepository, diagnosticCapture });
    const promptCatalog = config.features?.versionedPrompts === false ? null : createPromptCatalog({ rootDir: defaultPromptBundleRoot(), maxRenderedBytes: config.prompts.maxRenderedBytes });
    if (promptCatalog) logEvent('info', 'prompt.catalog.ready', { bundles: promptCatalog.inventory() });
    const babokSkillLoader = promptCatalog
      ? createBabokSkillBundleLoader({ rootDir: defaultBabokSkillBundleRoot() })
      : null;
    const babokSkillProfile = babokSkillLoader
      ? qualifyBabokSkillBundle({
        loader: babokSkillLoader,
        policy: config.skills?.babokRequirements || { active: '1.0.0', released: ['1.0.0'] },
      })
      : null;
    if (babokSkillProfile) logEvent('info', 'babok.skill.ready', babokSkillProfile);
    const handlers = createEnterpriseActivityHandlers({ artifactRepository, modelExecutor, promptCatalog, babokSkillLoader, config });
    activities = createCheckpointedActivities({ jobRepository, jobTraceRepository, diagnosticCapture, handlers, siteId: config.process.siteId });
  }
  const worker = await WorkerClass.create({
    connection,
    namespace: config.temporal.namespace,
    identity: config.temporal.identity,
    taskQueue: config.temporal.workerTaskQueue,
    workflowsPath: fileURLToPath(new URL('../workflows/index.js', import.meta.url)),
    activities,
    buildId: config.temporal.buildId,
    maxConcurrentActivityTaskExecutions: config.temporal.maxConcurrentActivities,
    shutdownGraceTime: config.process.workerShutdownGraceMs,
  });
  const health = await startWorkerHealthServer(config);
  const runPromise = worker.run().catch((error) => {
    logEvent('error', 'temporal.worker.failed', { role: config.process.role, errorType: error?.name || 'Error' });
    throw error;
  });
  logEvent('info', 'runtime.started', {
    role: config.process.role,
    site: config.process.siteId,
    taskQueue: config.temporal.workerTaskQueue,
    buildId: config.temporal.buildId,
  });

  return {
    role: config.process.role,
    async stop() {
      health.beginDrain();
      worker.shutdown();
      await runPromise;
      await health.close();
      await connection.close();
      await pool?.end();
    },
    forceStop() {
      health.beginDrain();
      worker.shutdown();
      health.close().catch(() => {});
      connection.close();
      pool?.end().catch(() => {});
    },
  };
}
