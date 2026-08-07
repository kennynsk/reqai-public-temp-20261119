import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

export function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
export function integer(name, fallback, min = 1) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} must be an integer >= ${min}`);
  return value;
}
export async function tokens(minimum = 100) {
  const path = required('QUAL_BEARER_TOKENS_FILE');
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length < minimum || parsed.some((value) => typeof value !== 'string' || value.length < 20)) throw new Error(`QUAL_BEARER_TOKENS_FILE must contain at least ${minimum} bearer tokens`);
  return parsed;
}
export async function api(path, token, options = {}) {
  const base = required('QUAL_API_BASE_URL').replace(/\/$/, ''); const started = performance.now();
  const response = await fetch(`${base}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const text = await response.text(); let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { status: response.status, body, durationMs: performance.now() - started, headers: Object.fromEntries(response.headers) };
}
export function percentile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]; }
export async function evidence(kind, startedAt, checks, measurements, metadata = {}) {
  const result = { schemaVersion: '1.0', evidenceId: randomUUID(), kind, startedAt, completedAt: new Date().toISOString(), environment: required('QUAL_ENVIRONMENT'), executionHost: hostname(), gitCommit: process.env.QUAL_GIT_COMMIT || 'TBD-unavailable', checks, measurements, metadata, passed: checks.every((check) => check.passed === true) };
  const canonical = JSON.stringify(result); result.sha256 = createHash('sha256').update(canonical).digest('hex');
  const directory = resolve(process.env.QUAL_EVIDENCE_DIR || 'qualification/evidence'); await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${startedAt.replaceAll(':', '-')}-${kind}.json`); await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  return { result, path };
}
export const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
