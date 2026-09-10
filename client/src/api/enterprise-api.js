import { createSHA256 } from 'hash-wasm';
import { readAccessToken } from './auth-session.js';

export class EnterpriseApiError extends Error {
  constructor(message, { status, code, requestId, retryable, details } = {}) {
    super(message);
    Object.assign(this, { name: 'EnterpriseApiError', status, code, requestId, retryable, details });
  }
}

const token = readAccessToken;

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
  listJobs: (query = {}, options = {}) => request(`/api/v1/jobs?${new URLSearchParams(Object.entries(query).filter(([, value]) => value != null))}`, options),
  updateJobMetadata: (id, body) => request(`/api/v1/jobs/${id}/metadata`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
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
  decomposeRequirements: (body, idempotencyKey = crypto.randomUUID()) => request('/api/v1/decompositions', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }),
  researchRequirements: (versionId, body = {}, idempotencyKey = crypto.randomUUID()) => request(`/api/v1/requirements/versions/${versionId}/research`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }),
  saveRequirementsVersion: (body) => request('/api/v1/requirements/versions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  getRequirementsVersion: (id) => request(`/api/v1/requirements/versions/${id}`),
  async exportRequirementsVersion(id, format) {
    const response = await fetch(`/api/v1/requirements/versions/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
    if (!response.ok) throw new EnterpriseApiError(`HTTP ${response.status}`, { status: response.status });
    return response.blob();
  },
  listRequirementsVersions: (jobId) => request(`/api/v1/jobs/${jobId}/requirements/versions`),
  openRequirementDiscussion: (jobId, anchorId, body = {}, options = {}) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}/discussions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, anchorId }), signal: options.signal }),
  getRequirementDiscussion: (jobId, anchorId, options = {}) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}/discussions/${encodeURIComponent(anchorId)}`, options),
  sendRequirementDiscussionMessage: (jobId, anchorId, body, idempotencyKey = crypto.randomUUID()) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}/discussions/${encodeURIComponent(anchorId)}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ ...body, clientMessageId: body?.clientMessageId || idempotencyKey }) }),
  retryRequirementDiscussion: (jobId, attemptId) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}/discussions/attempts/${encodeURIComponent(attemptId)}/retry`, { method: 'POST' }),
  cancelRequirementDiscussion: (jobId, attemptId) => request(`/api/v1/jobs/${encodeURIComponent(jobId)}/discussions/attempts/${encodeURIComponent(attemptId)}/cancel`, { method: 'POST' }),
  subscribeRequirementDiscussionEvents: (jobId, anchorId, options = {}) => subscribeRequirementDiscussionEvents(jobId, anchorId, options),
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

export async function subscribeRequirementDiscussionEvents(jobId, anchorId, { lastEventId = 0, signal, onEvent, onObservation, reconnectDelayMs = 1500 } = {}) {
  const controller = signal ? null : new AbortController();
  const activeSignal = signal || controller.signal;
  let cursor = Number(lastEventId) || 0;
  while (!activeSignal.aborted) {
    try {
      await onObservation?.({ type: cursor ? 'reconnect' : 'connect', jobId, anchorId, cursor, timestamp: new Date().toISOString() });
      const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/discussions/${encodeURIComponent(anchorId)}/events`, { headers: { Accept: 'text/event-stream', 'Last-Event-ID': String(cursor), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) }, signal: activeSignal });
      if (!response.ok) throw new Error(`SSE HTTP ${response.status}`);
      await onObservation?.({ type: 'connected', jobId, anchorId, cursor, timestamp: new Date().toISOString() });
      const reader = response.body?.getReader?.();
      if (!reader) throw new Error('SSE response has no readable body');
      const decoder = new TextDecoder(); let buffer = '';
      while (!activeSignal.aborted) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const id = block.match(/^id: (.+)$/m)?.[1]; const type = block.match(/^event: (.+)$/m)?.[1] || 'message'; const data = block.match(/^data: (.+)$/m)?.[1];
          if (id) cursor = Number(id) || cursor;
          if (!data) continue;
          let parsed;
          try { parsed = JSON.parse(data); }
          catch (error) { await onObservation?.({ type: 'parse-error', jobId, anchorId, cursor, errorType: error?.name || 'Error', timestamp: new Date().toISOString() }); continue; }
          try { await onEvent?.({ id: cursor, type, data: parsed }); }
          catch (error) { await onObservation?.({ type: 'event-handler-error', jobId, anchorId, cursor, errorType: error?.name || 'Error', timestamp: new Date().toISOString() }); throw error; }
        }
      }
    } catch (error) {
      if (activeSignal.aborted) return;
      await onObservation?.({ type: 'disconnected', jobId, anchorId, cursor, errorType: error?.name || 'Error', timestamp: new Date().toISOString() });
    } finally {
      if (!activeSignal.aborted) {
        await onObservation?.({ type: 'reconcile', jobId, anchorId, cursor, timestamp: new Date().toISOString() });
        try {
          const value = await enterpriseApi.getRequirementDiscussion(jobId, anchorId, { signal: activeSignal });
          await onEvent?.({ id: cursor, type: 'reconcile', data: value });
        } catch { /* retry on the next connection */ }
        await new Promise((resolve) => { const timer = setTimeout(resolve, Math.max(0, Number(reconnectDelayMs) || 0)); activeSignal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true }); });
      }
    }
  }
}
