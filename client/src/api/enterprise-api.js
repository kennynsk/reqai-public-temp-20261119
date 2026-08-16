import { createSHA256 } from 'hash-wasm';

export class EnterpriseApiError extends Error {
  constructor(message, { status, code, requestId, retryable, details } = {}) {
    super(message);
    Object.assign(this, { name: 'EnterpriseApiError', status, code, requestId, retryable, details });
  }
}

const token = () => localStorage.getItem('reqai.accessToken') || '';

async function request(path, { method = 'GET', headers = {}, body, signal } = {}) {
  const response = await fetch(path, { method, headers: { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...headers }, body, signal });
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    const error = payload.error || {};
    throw new EnterpriseApiError(error.message || `HTTP ${response.status}`, { status: response.status, ...error });
  }
  if (response.status === 204) return null;
  return response.json();
}

export const enterpriseApi = {
  getCapabilities: () => request('/api/v1'),
  listJobs: (query = {}) => request(`/api/v1/jobs?${new URLSearchParams(Object.entries(query).filter(([, value]) => value != null))}`),
  getJob: (id, options = {}) => request(`/api/v1/jobs/${id}`, options),
  getResult: (id, options = {}) => request(`/api/v1/jobs/${id}/result`, options),
  getJobTrace: (id, query = {}, options = {}) => request(`/api/v1/jobs/${id}/trace?${new URLSearchParams(Object.entries(query).filter(([, value]) => value != null))}`, options),
  getJobTraceDetail: (id, entryId, options = {}) => request(`/api/v1/jobs/${id}/trace/${entryId}`, options),
  async getResultContent(id) {
    const response = await fetch(`/api/v1/jobs/${id}/result/content`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
    if (!response.ok) throw new EnterpriseApiError(`HTTP ${response.status}`, { status: response.status });
    return response.text();
  },
  createJob: (body, idempotencyKey = crypto.randomUUID()) => request('/api/v1/jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }),
  saveRequirementsVersion: (body) => request('/api/v1/requirements/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  getRequirementsVersion: (id) => request(`/api/v1/requirements/versions/${id}`),
  listRequirementsVersions: (jobId) => request(`/api/v1/jobs/${jobId}/requirements/versions`),
  cancelJob: (id) => request(`/api/v1/jobs/${id}/cancel`, { method: 'POST' }),
  retryJob: (id, key = crypto.randomUUID()) => request(`/api/v1/jobs/${id}/retry`, { method: 'POST', headers: { 'Idempotency-Key': key } }),
  uploadArtifact(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/v1/artifacts');
      if (token()) xhr.setRequestHeader('Authorization', `Bearer ${token()}`);
      digestFile(file).then((hash) => {
        xhr.setRequestHeader('X-Content-SHA256', hash); xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (event) => onProgress?.(event.lengthComputable ? event.loaded / event.total : 0);
        xhr.onerror = () => reject(new EnterpriseApiError('Upload network failure', { retryable: true }));
        xhr.onload = () => {
          let payload = {};
          try { payload = JSON.parse(xhr.responseText); } catch { payload = {}; }
          if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
          else reject(new EnterpriseApiError(payload.error?.message || `HTTP ${xhr.status}`, { status: xhr.status, ...payload.error }));
        };
        xhr.send(file);
      }).catch(reject);
    });
  },
  async downloadArtifact(id) {
    const response = await fetch(`/api/v1/artifacts/${id}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
    if (!response.ok) throw new EnterpriseApiError(`HTTP ${response.status}`, { status: response.status });
    return response.blob();
  },
};

export async function digestFile(file) {
  const hash = await createSHA256(); const chunkBytes = 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkBytes) hash.update(new Uint8Array(await file.slice(offset, offset + chunkBytes).arrayBuffer()));
  return hash.digest('hex');
}

export function normalizeJobEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return event;
  return { ...event.data, ...event };
}

export async function subscribeJobEvents(jobId, { lastEventId = 0, signal, onEvent, onObservation }) {
  let cursor = lastEventId;
  while (!signal.aborted) {
    try {
      await onObservation?.({ type: cursor ? 'reconnect' : 'connect', jobId, cursor, timestamp: new Date().toISOString() });
      const response = await fetch(`/api/v1/jobs/${jobId}/events`, { headers: { Accept: 'text/event-stream', 'Last-Event-ID': String(cursor), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) }, signal });
      if (!response.ok) throw new Error(`SSE HTTP ${response.status}`);
      await onObservation?.({ type: 'connected', jobId, cursor, timestamp: new Date().toISOString() });
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (!signal.aborted) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const id = block.match(/^id: (.+)$/m)?.[1]; const data = block.match(/^data: (.+)$/m)?.[1];
          const nextCursor = id ? Number(id) : cursor;
          if (data) {
            let event;
            try { event = normalizeJobEvent(JSON.parse(data)); }
            catch (error) { cursor = nextCursor; await onObservation?.({ type: 'parse-error', jobId, cursor, errorType: error?.name || 'Error', timestamp: new Date().toISOString() }); continue; }
            try { await onEvent?.(event); cursor = nextCursor; }
            catch (error) { await onObservation?.({ type: 'event-handler-error', jobId, cursor, errorType: error?.name || 'Error', timestamp: new Date().toISOString() }); throw error; }
          } else if (id) {
            cursor = nextCursor;
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      await onObservation?.({ type: 'disconnected', jobId, cursor, errorType: error?.name || 'Error', timestamp: new Date().toISOString() });
      await new Promise((resolve) => { const timer = setTimeout(resolve, 1500); signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });
    } finally {
      if (!signal.aborted) {
        try {
          const job = await enterpriseApi.getJob(jobId, { signal });
          await onObservation?.({ type: 'reconcile', jobId, cursor, timestamp: new Date().toISOString() });
          await onEvent?.({ type: 'reconcile', jobId, job });
        } catch { /* retry on next cycle */ }
      }
    }
  }
}
