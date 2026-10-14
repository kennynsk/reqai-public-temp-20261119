import { loadEnvironmentFiles } from './load-env.js';

const SECRET_PATHS = new Set([
  'database.url',
  'kafka.username',
  'kafka.password',
  'auth.clientSecret',
  'webhook.secret',
  'llm.credentials',
  'llm.apiKey',
  'llm.accessToken',
  'llm.password',
  'llm.tlsKeyPassphrase',
]);

function optionalString(env, name, fallback = '') {
  const value = env[name];
  return value == null || value === '' ? fallback : String(value).trim();
}

function requiredString(env, name, condition = true) {
  const value = optionalString(env, name);
  if (condition && !value) throw new Error(`${name} is required`);
  return value;
}

function bool(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === '') return fallback;
  if (raw === true || String(raw).toLowerCase() === 'true') return true;
  if (raw === false || String(raw).toLowerCase() === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function integer(env, name, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  const value = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function number(env, name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[name];
  const value = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

function choice(env, name, fallback, allowed) {
  const value = optionalString(env, name, fallback);
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function csv(env, name, fallback = []) {
  const raw = optionalString(env, name);
  if (!raw) return [...fallback];
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function promptRelease(env, prefix, defaultActive = '1.0.0', defaultReleased = ['1.0.0']) {
  const active = optionalString(env, `${prefix}_ACTIVE_VERSION`, defaultActive);
  const released = csv(env, `${prefix}_RELEASED_VERSIONS`, defaultReleased);
  if (!/^[1-9]\d*\.\d+\.\d+$/.test(active) || released.some((version) => !/^[1-9]\d*\.\d+\.\d+$/.test(version))) {
    throw new Error(`${prefix} versions must use semantic versioning`);
  }
  if (released.length < 1 || released.length > 20 || new Set(released).size !== released.length) {
    throw new Error(`${prefix}_RELEASED_VERSIONS must contain 1 to 20 unique versions`);
  }
  if (!released.includes(active)) throw new Error(`${prefix}_ACTIVE_VERSION must be present in ${prefix}_RELEASED_VERSIONS`);
  return { active, released };
}

function intMap(env, name, fallback = {}) {
  const raw = optionalString(env, name);
  if (!raw) return { ...fallback };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON object`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${name} must be a JSON object`);
  for (const [key, item] of Object.entries(value)) {
    if (!key || !Number.isInteger(item) || item <= 0) throw new Error(`${name}.${key} must be a positive integer`);
  }
  return Object.freeze({ ...value });
}

function uniformIntMap(models, value) {
  return Object.fromEntries(models.map((model) => [model, value]));
}

function stringArrayMap(env, name, fallback = {}) {
  const raw = optionalString(env, name);
  if (!raw) return Object.fromEntries(Object.entries(fallback).map(([key, value]) => [key, [...value]]));
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON object`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${name} must be a JSON object`);
  for (const [key, item] of Object.entries(value)) {
    if (!Array.isArray(item) || item.some((entry) => typeof entry !== 'string' || !entry)) {
      throw new Error(`${name}.${key} must be an array of non-empty strings`);
    }
  }
  return value;
}

function url(env, name, { required = false, protocols = ['https:'] } = {}) {
  const raw = requiredString(env, name, required);
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} must use ${protocols.join(' or ')}`);
  return raw;
}

function validateIdentifier(name, value) {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value)) throw new Error(`${name} contains unsupported characters`);
  return value;
}

export function loadConfig(env = process.env, { loadFiles = env === process.env } = {}) {
  if (loadFiles) loadEnvironmentFiles(env);
  const production = ['production', 'prod'].includes(String(env.NODE_ENV || env.APP_ENV || '').toLowerCase());
  const asyncEnabled = bool(env, 'ASYNC_PLATFORM_ENABLED', false);
  const authEnabled = bool(env, 'AUTH_ENABLED', production);
  const webhookEnabled = bool(env, 'WEBHOOK_ENABLED', false);
  const providerMode = choice(env, 'LLM_PROVIDER_MODE', 'zai', ['zai', 'gigachat', 'mock']);
  const defaultProviderModels = providerMode === 'gigachat'
    ? ['GC-Max', 'GC-M', 'GC-Lite']
    : ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'];
  const availableModels = providerMode === 'gigachat'
    ? csv(env, 'LLM_MODEL_PRIORITY', defaultProviderModels)
    : csv(env, 'ZAI_MODELS', defaultProviderModels);
  if (availableModels.length < 1 || new Set(availableModels).size !== availableModels.length) {
    throw new Error(`${providerMode === 'gigachat' ? 'LLM_MODEL_PRIORITY' : 'ZAI_MODELS'} must contain distinct models`);
  }
  const models = providerMode === 'gigachat'
    ? [...availableModels]
    : csv(env, 'LLM_MODEL_PRIORITY', availableModels.slice(0, 3));
  if (models.length < 1 || models.length > 3 || new Set(models).size !== models.length) {
    throw new Error('LLM_MODEL_PRIORITY must contain 1 to 3 distinct models');
  }
  if (models.some((model) => !availableModels.includes(model))) {
    throw new Error('LLM_MODEL_PRIORITY must contain only models listed in ZAI_MODELS');
  }

  const softBacklog = integer(env, 'QUEUE_SOFT_BACKLOG_LIMIT', 1000, { min: 0, max: 1_000_000 });
  const hardBacklog = integer(env, 'QUEUE_HARD_BACKLOG_LIMIT', 5000, { min: 1, max: 1_000_000 });
  if (softBacklog >= hardBacklog) throw new Error('QUEUE_SOFT_BACKLOG_LIMIT must be below QUEUE_HARD_BACKLOG_LIMIT');

  const retryInitial = integer(env, 'LLM_RETRY_INITIAL_DELAY_MS', 2000, { min: 100, max: 600_000 });
  const retryMax = integer(env, 'LLM_RETRY_MAX_DELAY_MS', 30000, { min: 100, max: 600_000 });
  if (retryInitial > retryMax) throw new Error('LLM_RETRY_INITIAL_DELAY_MS must not exceed LLM_RETRY_MAX_DELAY_MS');

  const requestedGigaChatProfile = choice(env, 'GIGACHAT_PROFILE', 'auto', ['auto', 'personal', 'corp']);
  const personalCredentials = optionalString(env, 'GIGACHAT_AUTH_KEY') || (() => {
    const clientId = optionalString(env, 'GIGACHAT_CLIENT_ID');
    const clientSecret = optionalString(env, 'GIGACHAT_CLIENT_SECRET');
    return clientId && clientSecret ? Buffer.from(`${clientId}:${clientSecret}`).toString('base64') : '';
  })();
  const personalAccessToken = optionalString(env, 'GIGACHAT_ACCESS_TOKEN', optionalString(env, 'GIGACHAT_TOKEN'));
  const gigaChatProfile = requestedGigaChatProfile === 'auto'
    ? (personalCredentials || personalAccessToken ? 'personal' : 'corp')
    : requestedGigaChatProfile;
  const personalGigaChat = gigaChatProfile === 'personal';

  const webhookRetryInitial = integer(env, 'WEBHOOK_RETRY_INITIAL_DELAY_MS', 5000, { min: 100, max: 600_000 });
  const webhookRetryMax = integer(env, 'WEBHOOK_RETRY_MAX_DELAY_MS', 300000, { min: 100, max: 3_600_000 });
  if (webhookRetryInitial > webhookRetryMax) {
    throw new Error('WEBHOOK_RETRY_INITIAL_DELAY_MS must not exceed WEBHOOK_RETRY_MAX_DELAY_MS');
  }

  const config = {
    environment: production ? 'production' : 'development',
    asyncEnabled,
    features: {
      requirementsIntegrationApi: bool(env, 'REQUIREMENTS_INTEGRATION_API_ENABLED', true),
      versionedPrompts: bool(env, 'VERSIONED_PROMPTS_ENABLED', true),
      requirementDiscussion: bool(env, 'REQUIREMENT_DISCUSSION_ENABLED', true),
    },
    aiDiscussion: {
      qualityReassessment: bool(env, 'DISCUSSION_QUALITY_REASSESSMENT_ENABLED', true),
      semanticReview: bool(env, 'DISCUSSION_SEMANTIC_REVIEW_ENABLED', true),
      messageChars: integer(env, 'DISCUSSION_MESSAGE_MAX_CHARS', 12000, { min: 256, max: 100000 }),
      contextBytes: integer(env, 'DISCUSSION_CONTEXT_MAX_BYTES', 120000, { min: 4096, max: 1048576 }),
      outputChars: integer(env, 'DISCUSSION_OUTPUT_MAX_CHARS', 30000, { min: 256, max: 200000 }),
      historyMessages: integer(env, 'DISCUSSION_HISTORY_MESSAGES', 40, { min: 1, max: 200 }),
      maxChanges: integer(env, 'DISCUSSION_MAX_CHANGES', 20, { min: 1, max: 100 }),
      promptVersion: optionalString(env, 'DISCUSSION_PROMPT_VERSION', '1.0.0'),
    },
    prompts: {
      maxRenderedBytes: integer(env, 'PROMPT_MAX_RENDERED_BYTES', 2_097_152, { min: 1024, max: 10_485_760 }),
      policy: {
        'requirements-decomposition': promptRelease(env, 'PROMPT_DECOMPOSITION', '2.15.0', ['1.0.0', '2.0.0', '2.1.0', '2.2.0', '2.3.0', '2.4.0', '2.5.0', '2.6.0', '2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0', '2.13.0', '2.14.0', '2.15.0']),
        'requirements-insights': promptRelease(env, 'PROMPT_REQUIREMENTS_INSIGHTS', '2.15.0', ['1.0.0', '2.0.0', '2.1.0', '2.2.0', '2.3.0', '2.4.0', '2.5.0', '2.6.0', '2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0', '2.13.0', '2.14.0', '2.15.0']),
      },
    },
    skills: {
      babokRequirements: promptRelease(env, 'SKILL_BABOK_REQUIREMENTS'),
    },
    process: {
      role: choice(env, 'APP_ROLE', 'api', ['api', 'workflow-worker', 'event-worker', 'maintenance-worker']),
      siteId: validateIdentifier('DEPLOYMENT_SITE_ID', optionalString(env, 'DEPLOYMENT_SITE_ID', 'local')),
      port: integer(env, 'PORT', 5178, { min: 1, max: 65535 }),
      apiShutdownGraceMs: integer(env, 'API_SHUTDOWN_GRACE_MS', 30000, { min: 1000, max: 600_000 }),
      workerShutdownGraceMs: integer(env, 'WORKER_SHUTDOWN_GRACE_MS', 600000, { min: 1000, max: 3_600_000 }),
      workerHealthPort: integer(env, 'WORKER_HEALTH_PORT', 8081, { min: 1, max: 65535 }),
      logLevel: choice(env, 'LOG_LEVEL', 'info', ['debug', 'info', 'warn', 'error']),
      maintenanceDefaultMode: choice(env, 'MAINTENANCE_DEFAULT_MODE', 'NORMAL', ['NORMAL', 'ACCEPT_AND_QUEUE', 'DRAIN', 'REJECT_NEW', 'FAILOVER_IN_PROGRESS']),
    },
    database: {
      url: url(env, 'DATABASE_URL', { required: asyncEnabled, protocols: ['postgresql:', 'postgres:'] }),
      schema: validateIdentifier('DATABASE_SCHEMA', optionalString(env, 'DATABASE_SCHEMA', 'reqai')),
      artifactSchema: validateIdentifier('DATABASE_ARTIFACT_SCHEMA', optionalString(env, 'DATABASE_ARTIFACT_SCHEMA', 'reqai_artifacts')),
      poolMin: integer(env, 'DATABASE_POOL_MIN', 2, { min: 0, max: 100 }),
      poolMax: integer(env, 'DATABASE_POOL_MAX', 20, { min: 1, max: 500 }),
      connectTimeoutMs: integer(env, 'DATABASE_CONNECT_TIMEOUT_MS', 5000, { min: 100, max: 60_000 }),
      statementTimeoutMs: integer(env, 'DATABASE_STATEMENT_TIMEOUT_MS', 30000, { min: 1000, max: 600_000 }),
      sslMode: choice(env, 'DATABASE_SSL_MODE', production ? 'verify-full' : 'disable', ['disable', 'require', 'verify-ca', 'verify-full']),
      caCertPath: optionalString(env, 'DATABASE_CA_CERT_PATH'),
    },
    kafka: {
      brokers: csv(env, 'KAFKA_BROKERS'),
      clientId: optionalString(env, 'KAFKA_CLIENT_ID', `reqai-${optionalString(env, 'DEPLOYMENT_SITE_ID', 'local')}`),
      jobEventsTopic: optionalString(env, 'KAFKA_JOB_EVENTS_TOPIC', 'reqai.job-events.v1'),
      webhookDlqTopic: optionalString(env, 'KAFKA_WEBHOOK_DLQ_TOPIC', 'reqai.webhook-dlq.v1'),
      username: optionalString(env, 'KAFKA_USERNAME'),
      password: optionalString(env, 'KAFKA_PASSWORD'),
      ssl: bool(env, 'KAFKA_SSL_ENABLED', production),
      saslMechanism: choice(env, 'KAFKA_SASL_MECHANISM', 'plain', ['plain', 'scram-sha-256', 'scram-sha-512']),
      outboxBatchSize: integer(env, 'OUTBOX_PUBLISH_BATCH_SIZE', 100, { min: 1, max: 1000 }),
      outboxIntervalMs: integer(env, 'OUTBOX_PUBLISH_INTERVAL_MS', 1000, { min: 100, max: 60_000 }),
    },
    sse: {
      heartbeatMs: integer(env, 'SSE_HEARTBEAT_MS', 15000, { min: 1000, max: 120000 }),
      pollMs: integer(env, 'SSE_POLL_INTERVAL_MS', 1000, { min: 100, max: 30000 }),
    },
    diagnostics: {
      captureProtected: bool(env, 'DIAGNOSTIC_CAPTURE_PROTECTED', false),
      maxPageSize: integer(env, 'DIAGNOSTIC_TRACE_MAX_PAGE_SIZE', 100, { min: 10, max: 500 }),
      maxDetailBytes: integer(env, 'DIAGNOSTIC_DETAIL_MAX_BYTES', 1_048_576, { min: 1024, max: 10_485_760 }),
    },
    temporal: {
      address: requiredString(env, 'TEMPORAL_ADDRESS', asyncEnabled),
      namespace: optionalString(env, 'TEMPORAL_NAMESPACE', 'reqai'),
      identity: validateIdentifier('TEMPORAL_WORKER_IDENTITY', optionalString(env, 'TEMPORAL_WORKER_IDENTITY', `reqai-${optionalString(env, 'APP_ROLE', 'api')}-${optionalString(env, 'DEPLOYMENT_SITE_ID', 'local')}`)),
      buildId: validateIdentifier('TEMPORAL_WORKFLOW_BUILD_ID', optionalString(env, 'TEMPORAL_WORKFLOW_BUILD_ID', 'reqai-v1')),
      taskQueues: Object.freeze({
        decomposition: optionalString(env, 'TEMPORAL_TASK_QUEUE_DECOMPOSITION', 'requirements-decomposition'),
        research: optionalString(env, 'TEMPORAL_TASK_QUEUE_RESEARCH', 'requirements-research'),
      }),
      workerTaskQueue: optionalString(env, 'TEMPORAL_WORKER_TASK_QUEUE', optionalString(env, 'TEMPORAL_TASK_QUEUE_DECOMPOSITION', 'requirements-decomposition')),
      maxConcurrentActivities: integer(env, 'WORKER_MAX_CONCURRENT_ACTIVITIES', 10, { min: 1, max: 1000 }),
      heartbeatMs: integer(env, 'WORKER_ACTIVITY_HEARTBEAT_MS', 30000, { min: 1000, max: 300_000 }),
      tls: {
        enabled: bool(env, 'TEMPORAL_TLS_ENABLED', production),
        certPath: optionalString(env, 'TEMPORAL_TLS_CERT_PATH'),
        keyPath: optionalString(env, 'TEMPORAL_TLS_KEY_PATH'),
        serverName: optionalString(env, 'TEMPORAL_TLS_SERVER_NAME'),
      },
    },
    auth: {
      enabled: authEnabled,
      issuer: url(env, 'IAM_ISSUER', { required: authEnabled }),
      audience: requiredString(env, 'IAM_AUDIENCE', authEnabled),
      jwksUri: url(env, 'IAM_JWKS_URI'),
      userIdClaim: optionalString(env, 'IAM_USER_ID_CLAIM', 'sub'),
      rolesClaim: optionalString(env, 'IAM_ROLES_CLAIM', 'roles'),
      tenantClaim: optionalString(env, 'IAM_TENANT_CLAIM', 'tenant_id'),
      defaultTenantAllowed: bool(env, 'IAM_DEFAULT_TENANT_ALLOWED', true),
      clockToleranceSeconds: integer(env, 'IAM_CLOCK_TOLERANCE_SECONDS', 60, { min: 0, max: 300 }),
      roleMapping: stringArrayMap(env, 'IAM_ROLE_MAPPING_JSON', {
        user: ['reqai-user'],
        'tenant-admin': ['reqai-tenant-admin'],
        operator: ['reqai-operator'],
        auditor: ['reqai-auditor'],
        'system-admin': ['reqai-system-admin'],
      }),
      clientSecret: optionalString(env, 'IAM_CLIENT_SECRET'),
    },
    tenancy: {
      defaultTenantId: validateIdentifier('DEFAULT_TENANT_ID', optionalString(env, 'DEFAULT_TENANT_ID', 'default-enterprise')),
    },
    jobs: {
      maxPerMinute: integer(env, 'ADMISSION_MAX_JOBS_PER_MINUTE', 30, { min: 1, max: 10_000 }),
      maxActivePerUser: integer(env, 'ADMISSION_MAX_ACTIVE_JOBS_PER_USER', 5, { min: 1, max: 1000 }),
      softBacklog,
      hardBacklog,
      decompositionPriority: integer(env, 'DECOMPOSITION_QUEUE_PRIORITY', 100, { min: 0, max: 1000 }),
      researchPriority: integer(env, 'RESEARCH_QUEUE_PRIORITY', 50, { min: 0, max: 1000 }),
      decompositionDeadlineMs: integer(env, 'JOB_DECOMPOSITION_DEADLINE_MS', 3_600_000, { min: 60_000, max: 86_400_000 }),
      researchDeadlineMs: integer(env, 'JOB_RESEARCH_DEADLINE_MS', 14_400_000, { min: 60_000, max: 86_400_000 }),
      inputMaxBytes: integer(env, 'JOB_INPUT_MAX_BYTES', 104_857_600, { min: 1, max: 104_857_600 }),
      resultMaxBytes: integer(env, 'JOB_RESULT_MAX_BYTES', 104_857_600, { min: 1, max: 104_857_600 }),
    },
    llm: {
      providerMode,
      providerProfile: providerMode === 'gigachat' ? gigaChatProfile : 'default',
      mockDelayMs: integer(env, 'LLM_MOCK_DELAY_MS', 250, { min: 0, max: 60_000 }),
      availableModels: Object.freeze(availableModels),
      models: Object.freeze(models),
      maxModelsPerStep: integer(env, 'LLM_MAX_MODELS_PER_STEP', 3, { min: 1, max: 3 }),
      maxAttemptsPerModel: integer(env, 'LLM_MAX_ATTEMPTS_PER_MODEL', 2, { min: 1, max: 2 }),
      requestTimeoutMs: integer(env, 'LLM_REQUEST_TIMEOUT_MS', 600000, { min: 1000, max: 1_800_000 }),
      retryInitialDelayMs: retryInitial,
      retryMaxDelayMs: retryMax,
      retryJitterPercent: integer(env, 'LLM_RETRY_JITTER_PERCENT', 20, { min: 0, max: 100 }),
      rpm: intMap(env, 'LLM_MODEL_RPM_JSON', uniformIntMap(availableModels, 30)),
      tpm: intMap(env, 'LLM_MODEL_TPM_JSON', uniformIntMap(availableModels, 1_000_000)),
      contextTokens: intMap(env, 'LLM_MODEL_CONTEXT_TOKENS_JSON', uniformIntMap(availableModels, 128_000)),
      outputTokens: Object.freeze({ ...uniformIntMap(availableModels, 32_000), ...intMap(env, 'LLM_MODEL_OUTPUT_TOKENS_JSON') }),
      decompositionOutputTokens: Object.freeze({ ...uniformIntMap(availableModels, 16_000), ...intMap(env, 'LLM_DECOMPOSITION_OUTPUT_TOKENS_JSON') }),
      decompositionThinking: choice(env, 'LLM_DECOMPOSITION_THINKING', 'disabled', ['enabled', 'disabled']),
      maxConcurrency: intMap(env, 'LLM_MODEL_MAX_CONCURRENCY_JSON', uniformIntMap(availableModels, 5)),
      circuitFailureThreshold: integer(env, 'LLM_CIRCUIT_FAILURE_THRESHOLD', 5, { min: 1, max: 1000 }),
      circuitWindowMs: integer(env, 'LLM_CIRCUIT_WINDOW_MS', 60000, { min: 1000, max: 3_600_000 }),
      circuitOpenMs: integer(env, 'LLM_CIRCUIT_OPEN_MS', 120000, { min: 1000, max: 3_600_000 }),
      circuitHalfOpenMaxRequests: integer(env, 'LLM_CIRCUIT_HALF_OPEN_MAX_REQUESTS', 1, { min: 1, max: 100 }),
      modelAliases: (() => {
        const fallback = providerMode === 'gigachat'
          ? { 'GC-Max': 'GigaChat-2-Max', 'GC-M': 'GigaChat-2-Pro', 'GC-Lite': 'GigaChat-2' }
          : Object.fromEntries(availableModels.map((model) => [model, model]));
        const aliases = optionalString(env, 'LLM_MODEL_ALIASES_JSON', JSON.stringify(fallback));
        try { return Object.freeze(JSON.parse(aliases)); } catch { throw new Error('LLM_MODEL_ALIASES_JSON must be a JSON object'); }
      })(),
      apiKey: optionalString(env, 'ZAI_API_KEY', optionalString(env, 'ZAI_KEY', optionalString(env, 'ZAI_TOKEN'))),
      credentials: providerMode === 'gigachat' ? (personalGigaChat ? personalCredentials : optionalString(env, 'GIGACHAT_CORP_CREDENTIALS')) : '',
      accessToken: providerMode === 'gigachat' ? (personalGigaChat ? personalAccessToken : optionalString(env, 'GIGACHAT_CORP_ACCESS_TOKEN')) : '',
      user: providerMode === 'gigachat' && !personalGigaChat ? optionalString(env, 'GIGACHAT_CORP_USER') : '',
      password: providerMode === 'gigachat' && !personalGigaChat ? optionalString(env, 'GIGACHAT_CORP_PASSWORD') : '',
      baseUrl: providerMode === 'zai'
        ? (url(env, 'ZAI_BASE_URL', { protocols: ['https:'] }) || 'https://api.z.ai/api/coding/paas/v4')
        : (personalGigaChat
          ? (url(env, 'GIGACHAT_BASE_URL', { protocols: ['https:'] }) || 'https://gigachat.devices.sberbank.ru/api/v1')
          : (url(env, 'GIGACHAT_CORP_BASE_URL', { protocols: ['https:'] }) || 'https://gigachat.devices.sberbank.ru/api/v1')),
      authUrl: providerMode === 'gigachat'
        ? (personalGigaChat
          ? (url(env, 'GIGACHAT_OAUTH_URL', { protocols: ['https:'] }) || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth')
          : (url(env, 'GIGACHAT_CORP_AUTH_URL', { protocols: ['https:'] }) || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'))
        : '',
      scope: providerMode === 'gigachat' ? (personalGigaChat ? optionalString(env, 'GIGACHAT_SCOPE', 'GIGACHAT_API_PERS') : optionalString(env, 'GIGACHAT_CORP_SCOPE', 'GIGACHAT_API_CORP')) : '',
      caCertPath: providerMode === 'gigachat' ? (personalGigaChat ? optionalString(env, 'GIGACHAT_CA_CERT_PATH', optionalString(env, 'NODE_EXTRA_CA_CERTS')) : optionalString(env, 'GIGACHAT_CORP_CA_CERT_PATH')) : '',
      tlsCertPath: providerMode === 'gigachat' && !personalGigaChat ? optionalString(env, 'GIGACHAT_CORP_TLS_CERT_PATH') : '',
      tlsKeyPath: providerMode === 'gigachat' && !personalGigaChat ? optionalString(env, 'GIGACHAT_CORP_TLS_KEY_PATH') : '',
      tlsKeyPassphrase: providerMode === 'gigachat' && !personalGigaChat ? optionalString(env, 'GIGACHAT_CORP_TLS_KEY_PASSPHRASE') : '',
      rejectUnauthorized: providerMode === 'gigachat' ? (personalGigaChat ? bool(env, 'GIGACHAT_REJECT_UNAUTHORIZED', true) : bool(env, 'GIGACHAT_CORP_REJECT_UNAUTHORIZED', true)) : true,
      chunkTargetTokens: integer(env, 'LLM_CHUNK_TARGET_TOKENS', 60000, { min: 1000, max: 120000 }),
      chunkConcurrency: integer(env, 'LLM_CHUNK_CONCURRENCY', 3, { min: 1, max: 20 }),
    },
    webhook: {
      enabled: webhookEnabled,
      url: url(env, 'WEBHOOK_URL', { required: webhookEnabled }),
      secret: requiredString(env, 'WEBHOOK_SECRET', webhookEnabled),
      timeoutMs: integer(env, 'WEBHOOK_TIMEOUT_MS', 10000, { min: 1000, max: 120_000 }),
      maxAttempts: integer(env, 'WEBHOOK_MAX_ATTEMPTS', 5, { min: 1, max: 20 }),
      retryInitialDelayMs: webhookRetryInitial,
      retryMaxDelayMs: webhookRetryMax,
      allowedHosts: csv(env, 'WEBHOOK_ALLOWED_HOSTS'),
    },
    retention: {
      finalResultsDays: integer(env, 'RETENTION_FINAL_RESULTS_DAYS', 180, { min: 1, max: 3650 }),
      checkpointsDays: integer(env, 'RETENTION_CHECKPOINTS_AFTER_COMPLETION_DAYS', 30, { min: 1, max: 3650 }),
      intermediateDays: integer(env, 'RETENTION_INTERMEDIATE_RESULTS_DAYS', 30, { min: 1, max: 3650 }),
      rawLlmDays: integer(env, 'RETENTION_RAW_LLM_RESPONSES_DAYS', 14, { min: 1, max: 3650 }),
      fullPromptsDays: integer(env, 'RETENTION_FULL_PROMPTS_DAYS', 14, { min: 1, max: 3650 }),
      auditDays: integer(env, 'RETENTION_AUDIT_DAYS', 365, { min: 1, max: 3650 }),
      cleanupBatchSize: integer(env, 'RETENTION_CLEANUP_BATCH_SIZE', 500, { min: 1, max: 10_000 }),
      intervalMs: integer(env, 'RETENTION_CLEANUP_INTERVAL_MS', 3600000, { min: 60000, max: 86400000 }),
    },
    jobMetadataBackfill: {
      batchSize: integer(env, 'JOB_METADATA_BACKFILL_BATCH_SIZE', 100, { min: 1, max: 500 }),
      intervalMs: integer(env, 'JOB_METADATA_BACKFILL_INTERVAL_MS', 300000, { min: 60000, max: 86400000 }),
    },
    slo: {
      availabilityPercent: number(env, 'SLO_AVAILABILITY_PERCENT', 99.5, { min: 0, max: 100 }),
      apiP95Ms: integer(env, 'SLO_API_P95_MS', 500, { min: 1 }),
      jobAcceptP95Ms: integer(env, 'SLO_JOB_ACCEPT_P95_MS', 2000, { min: 1 }),
      decompositionStartP95Ms: integer(env, 'SLO_DECOMPOSITION_START_P95_MS', 30000, { min: 1 }),
      researchStartP95Ms: integer(env, 'SLO_RESEARCH_START_P95_MS', 120000, { min: 1 }),
      activityRecoveryMs: integer(env, 'SLO_ACTIVITY_RECOVERY_MS', 120000, { min: 1 }),
      rpoSeconds: integer(env, 'FAILOVER_RPO_TARGET_SECONDS', 300, { min: 1 }),
      rtoSeconds: integer(env, 'FAILOVER_RTO_TARGET_SECONDS', 1800, { min: 1 }),
    },
  };

  if (config.database.poolMin > config.database.poolMax) throw new Error('DATABASE_POOL_MIN must not exceed DATABASE_POOL_MAX');
  if (asyncEnabled && config.kafka.brokers.length === 0) throw new Error('KAFKA_BROKERS is required when ASYNC_PLATFORM_ENABLED=true');
  if (asyncEnabled && config.temporal.tls.enabled && (!config.temporal.tls.certPath || !config.temporal.tls.keyPath)) {
    throw new Error('TEMPORAL_TLS_CERT_PATH and TEMPORAL_TLS_KEY_PATH are required when TEMPORAL_TLS_ENABLED=true');
  }
  if (config.webhook.enabled && !config.webhook.allowedHosts.includes(new URL(config.webhook.url).hostname)) throw new Error('WEBHOOK_ALLOWED_HOSTS must include WEBHOOK_URL hostname');
  if (config.process.role === 'workflow-worker' && !Object.values(config.temporal.taskQueues).includes(config.temporal.workerTaskQueue)) {
    throw new Error('TEMPORAL_WORKER_TASK_QUEUE must match one of the configured Temporal task queues');
  }
  for (const model of availableModels) {
    for (const [name, map] of Object.entries({
      LLM_MODEL_RPM_JSON: config.llm.rpm,
      LLM_MODEL_TPM_JSON: config.llm.tpm,
      LLM_MODEL_CONTEXT_TOKENS_JSON: config.llm.contextTokens,
      LLM_MODEL_OUTPUT_TOKENS_JSON: config.llm.outputTokens,
      LLM_DECOMPOSITION_OUTPUT_TOKENS_JSON: config.llm.decompositionOutputTokens,
      LLM_MODEL_MAX_CONCURRENCY_JSON: config.llm.maxConcurrency,
    })) {
      if (!map[model]) throw new Error(`${name} must define configured model ${model}`);
    }
    if (config.llm.providerMode === 'gigachat' && !config.llm.modelAliases[model]) throw new Error(`LLM_MODEL_ALIASES_JSON must define configured model ${model}`);
  }
  if (production && config.llm.providerMode === 'mock') {
    throw new Error('LLM_PROVIDER_MODE=mock is forbidden in production');
  }
  if (asyncEnabled && config.process.role === 'workflow-worker' && config.llm.providerMode === 'gigachat' && !config.llm.credentials && !config.llm.accessToken && !(config.llm.user && config.llm.password)) {
    throw new Error('A GigaChat credential method is required for workflow-worker');
  }
  if (asyncEnabled && config.process.role === 'workflow-worker' && config.llm.providerMode === 'zai' && !config.llm.apiKey) {
    throw new Error('ZAI_API_KEY is required for workflow-worker');
  }

  return deepFreeze(config);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function redactedConfig(config) {
  function visit(value, prefix = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      result[key] = SECRET_PATHS.has(path) ? { configured: Boolean(child) } : visit(child, path);
    }
    return result;
  }
  return visit(config);
}
