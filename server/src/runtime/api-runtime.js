import { createApp } from '../app.js';
import { checkDatabaseHealth, createDatabasePool } from '../db/pool.js';
import { logEvent } from '../middleware/safe-logging.js';
import { JobRepository } from '../repositories/job-repository.js';
import { AuditRepository } from '../repositories/audit-repository.js';
import { ArtifactRepository } from '../repositories/artifact-repository.js';
import { EventRepository } from '../repositories/event-repository.js';
import { WebhookRepository } from '../repositories/webhook-repository.js';
import { OperationalRepository } from '../repositories/operational-repository.js';
import { RequirementsVersionRepository } from '../repositories/requirements-version-repository.js';
import { JobTraceRepository } from '../repositories/job-trace-repository.js';
import { createTemporalWorkflowEngine } from '../workflow/temporal-workflow-engine.js';
import { createJobService } from '../services/job-service.js';
import { createJobQueryService } from '../services/job-query-service.js';
import { createReadinessService } from '../services/readiness-service.js';
import { createRequirementsVersionService } from '../services/requirements-version-service.js';
import { createRequirementsIntegrationService } from '../services/requirements-integration-service.js';
import { createJobTraceService } from '../services/job-trace-service.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../prompts/prompt-profile-resolver.js';
import { createBabokSkillBundleLoader, defaultBabokSkillBundleRoot, qualifyBabokSkillBundle } from '../skills/babok-skill-bundle.js';

export async function startApiRuntime(config, { createAppFn = createApp } = {}) {
  const promptCatalog = config.features?.versionedPrompts === false ? null : createPromptCatalog({ rootDir: defaultPromptBundleRoot(), maxRenderedBytes: config.prompts.maxRenderedBytes });
  const promptProfileResolver = promptCatalog ? createPromptProfileResolver({ catalog: promptCatalog, policy: config.prompts.policy }) : null;
  if (promptCatalog) logEvent('info', 'prompt.catalog.ready', { bundles: promptCatalog.inventory() });
  const babokSkillProfile = promptCatalog
    ? qualifyBabokSkillBundle({
      loader: createBabokSkillBundleLoader({ rootDir: defaultBabokSkillBundleRoot() }),
      policy: config.skills?.babokRequirements || { active: '1.0.0', released: ['1.0.0'] },
    })
    : null;
  if (babokSkillProfile) logEvent('info', 'babok.skill.ready', babokSkillProfile);
  const databasePool = config.asyncEnabled ? createDatabasePool(config) : null;
  const operationalRepository = databasePool ? new OperationalRepository(databasePool, { schema: config.database.schema, siteId: config.process.siteId }) : null;
  const readiness = createReadinessService({
    checks: databasePool ? [{ name: 'postgresql', check: () => checkDatabaseHealth(databasePool) }, { name: 'operational-mode', check: async () => ({ ok: (await operationalRepository.get({ tenantId: config.tenancy.defaultTenantId }))?.mode !== 'DRAIN' }) }] : [],
  });
  const jobRepository = databasePool ? new JobRepository(databasePool, { schema: config.database.schema, artifactSchema: config.database.artifactSchema }) : null;
  const auditRepository = databasePool ? new AuditRepository(databasePool, { schema: config.database.schema }) : null;
  const artifactRepository = databasePool ? new ArtifactRepository(databasePool, { schema: config.database.schema, artifactSchema: config.database.artifactSchema }) : null;
  const eventRepository = databasePool ? new EventRepository(databasePool, { schema: config.database.schema }) : null;
  const webhookRepository = databasePool ? new WebhookRepository(databasePool, { schema: config.database.schema }) : null;
  const requirementsVersionRepository = databasePool ? new RequirementsVersionRepository(databasePool, { schema: config.database.schema }) : null;
  const jobTraceRepository = databasePool ? new JobTraceRepository(databasePool, { schema: config.database.schema }) : null;
  const workflowEngine = config.asyncEnabled ? await createTemporalWorkflowEngine(config) : null;
  const requirementsVersionService = databasePool ? createRequirementsVersionService({
    config,
    jobRepository,
    artifactRepository,
    versionRepository: requirementsVersionRepository,
    auditRepository,
  }) : null;
  const jobService = createJobService({ config, jobRepository, operationalRepository, requirementsVersionService, jobTraceRepository, promptProfileResolver, babokSkillProfile });
  const requirementsIntegrationService = databasePool ? createRequirementsIntegrationService({ config, artifactRepository, jobService, requirementsVersionService }) : null;
  const services = {
    jobService,
    jobQueryService: createJobQueryService({ config, jobRepository, auditRepository }),
    jobTraceService: databasePool ? createJobTraceService({ config, jobTraceRepository, artifactRepository, auditRepository }) : null,
    artifactRepository,
    eventRepository,
    webhookRepository,
    workflowEngine,
    auditRepository,
    operationalRepository,
    requirementsVersionService,
    jobTraceRepository,
    promptCatalog,
    babokSkillProfile,
    requirementsIntegrationService,
  };
  const created = createAppFn({ siteId: config.process.siteId, readiness, config, services });
  const { app } = created;
  const server = app.listen(config.process.port, () => {
    logEvent('info', 'runtime.started', {
      role: config.process.role,
      site: config.process.siteId,
      port: config.process.port,
    });
  });

  return {
    role: 'api',
    async stop() {
      readiness.beginDrain();
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await databasePool?.end();
      await workflowEngine?.close();
    },
    forceStop() {
      readiness.beginDrain();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      databasePool?.end().catch(() => {});
      workflowEngine?.close().catch(() => {});
    },
  };
}
