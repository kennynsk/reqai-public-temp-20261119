export async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

export async function waitForJob(baseUrl, jobId, readStatus) {
  // A research call may use two five-minute attempts per model and bounded fallback.
  // Keep the harness deadline above the platform's longest expected provider path.
  const timeoutMs = Number(process.env.REQAI_E2E_TIMEOUT_MS || 2_100_000);
  const deadline = Date.now() + timeoutMs;
  let status;
  while (Date.now() < deadline) {
    status = readStatus ? await readStatus(jobId) : await json(await fetch(`${baseUrl}/api/v1/jobs/${jobId}`));
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (status?.status !== 'SUCCEEDED') throw new Error(`Job ${jobId} did not succeed within ${timeoutMs} ms: ${JSON.stringify(status)}`);
  return status;
}

export async function readResult(baseUrl, jobId) {
  const metadata = await json(await fetch(`${baseUrl}/api/v1/jobs/${jobId}/result`));
  const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/result/content`);
  if (!response.ok) throw new Error(`Result content for ${jobId} failed with ${response.status}`);
  const text = await response.text();
  let content;
  try { content = JSON.parse(text); } catch { content = text; }
  return { metadata, content };
}

export function verifyModel(result, expectedModel) {
  const attempts = result.modelAttempts || [];
  if (!attempts.length) throw new Error(`Job ${result.jobId} has no model attempts`);
  const unexpected = attempts.filter((attempt) => attempt.result !== 'SUCCEEDED'
    || attempt.requestedModel !== expectedModel
    || attempt.model !== expectedModel);
  if (unexpected.length) {
    throw new Error(`Job ${result.jobId} was not error-free exclusively on ${expectedModel}: ${JSON.stringify(unexpected)}`);
  }
}

export function collectRequirements(value) {
  const output = { business: [], functional: [], nonfunctional: [] };
  const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
  const seen = new Set();
  const add = (source) => {
    if (!source || typeof source !== 'object') return;
    for (const key of Object.keys(output)) {
      if (!Array.isArray(source[key])) continue;
      for (const item of source[key]) {
        const candidate = typeof item === 'string' ? { text: item } : item;
        const text = String(candidate?.text || candidate?.description || '').trim();
        if (!text) continue;
        let id = String(candidate?.id || `${prefixes[key]}-${output[key].length + 1}`).trim();
        while (seen.has(id)) id = `${id}-${output[key].length + 1}`;
        seen.add(id);
        output[key].push({ ...candidate, id, text });
      }
    }
  };
  add(value);
  if (Array.isArray(value?.decomposition)) value.decomposition.forEach((section) => add(section?.content));
  return output;
}

export function summarizeJob(status, result) {
  return {
    jobId: status.jobId,
    status: status.status,
    outcome: result.metadata.outcome,
    failedSteps: result.metadata.failedSteps,
    modelAttempts: result.metadata.modelAttempts,
    resultKind: typeof result.content === 'object' ? result.content?.kind || 'json' : 'text',
  };
}
