import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
test('feature flag preserves explicit legacy rollback path',async()=>{const source=await readFile(new URL('./App.jsx',import.meta.url),'utf8');expect(source).toMatch(/VITE_ASYNC_PLATFORM_ENABLED/);expect(source).toMatch(/RequirementsDecomposer/);expect(source).toMatch(/BizReqResearcher/);});
test('API client normalizes auth, idempotency, SSE reconciliation and upload progress',async()=>{const source=await readFile(new URL('./api/enterprise-api.js',import.meta.url),'utf8');for(const marker of ['Authorization','Idempotency-Key','Last-Event-ID','reconcile','xhr.upload.onprogress'])expect(source).toContain(marker);});
