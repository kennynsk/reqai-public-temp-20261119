import { logEvent } from '../middleware/safe-logging.js';

const SECRET_KEYS = ['authorization', 'cookie', 'token', 'secret', 'password', 'apikey', 'api_key', 'credential'];

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      SECRET_KEYS.some((part) => key.toLowerCase().includes(part)) ? '[REDACTED]' : sanitize(child),
    ]));
  }
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  }
  return value;
}

export function createDiagnosticCaptureService({ config, artifactRepository, jobTraceRepository, clock = () => new Date() }) {
  return {
    async capture({ tenantId, ownerUserId, jobId, stepId = null, category, name, kind, content, visibility = 'PRIVILEGED' }) {
      if (!config.diagnostics.captureProtected) return null;
      const retentionDays = kind === 'PROMPT' || kind === 'INSTRUCTIONS'
        ? config.retention.fullPromptsDays
        : kind === 'OUTPUT' || kind === 'ERROR_STACK'
          ? config.retention.rawLlmDays
          : config.retention.intermediateDays;
      const expiresAt = new Date(clock().getTime() + retentionDays * 86_400_000);
      try {
        const artifactKind = kind === 'PROMPT' || kind === 'INSTRUCTIONS' ? 'PROMPT'
          : kind === 'OUTPUT' || kind === 'ERROR_STACK' ? 'RAW_LLM' : 'INTERMEDIATE';
        const artifact = await artifactRepository.createText({
          tenantId,
          ownerUserId,
          text: JSON.stringify(sanitize(content)),
          kind: artifactKind,
          contentType: 'application/json',
          expiresAt,
          maxBytes: config.diagnostics.maxDetailBytes,
        });
        return jobTraceRepository.append({
          tenantId,
          jobId,
          stepId,
          category,
          name,
          status: 'INFO',
          startedAt: clock(),
          completedAt: clock(),
          durationMs: 0,
          metadata: { capture: 'PROTECTED', sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
          detailArtifactId: artifact.artifactId,
          detailKind: kind,
          detailVisibility: visibility,
          expiresAt,
        });
      } catch (error) {
        logEvent('warn', 'diagnostic.capture.failed', { jobId, stepId, kind, errorType: error?.name || 'Error' });
        return null;
      }
    },
  };
}
