import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
test('application exposes only the asynchronous requirements workspace',async()=>{const source=await readFile(new URL('./App.jsx',import.meta.url),'utf8');expect(source).toMatch(/AsyncJobWorkspace/);expect(source).not.toMatch(/VITE_ASYNC_PLATFORM_ENABLED|RequirementsDecomposer|BizReqResearcher/);});
test('API client normalizes auth, idempotency, SSE reconciliation and upload progress',async()=>{const source=await readFile(new URL('./api/enterprise-api.js',import.meta.url),'utf8');for(const marker of ['Authorization','Idempotency-Key','Last-Event-ID','reconcile','xhr.upload.onprogress'])expect(source).toContain(marker);});
