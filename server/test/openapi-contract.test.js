import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.resolve(testDir, '..', '..', 'docs', 'api', 'openapi.v1.json');
const spec = JSON.parse(await readFile(specPath, 'utf8'));

const requiredOperations = {
  'POST /api/v1/decompositions': ['202', '400', '401', '403', '404', '409', '413', '429', '503'],
  'POST /api/v1/research': ['202', '400', '401', '403', '404', '409', '413', '429', '503'],
  'POST /api/v1/requirements/versions/{versionId}/research': ['202', '400', '401', '403', '404', '409', '429', '503'],
  'POST /api/v1/jobs': ['202', '400', '401', '409', '429', '503'],
  'GET /api/v1/jobs': ['200', '401'],
  'GET /api/v1/jobs/{jobId}': ['200', '401', '404'],
  'GET /api/v1/jobs/{jobId}/result': ['200', '401', '404', '409'],
  'GET /api/v1/jobs/{jobId}/result/content': ['200', '401', '404'],
  'POST /api/v1/jobs/{jobId}/cancel': ['202', '401', '404', '409'],
  'POST /api/v1/jobs/{jobId}/retry': ['202', '401', '403', '404', '409'],
  'GET /api/v1/jobs/{jobId}/events': ['200', '401', '404'],
  'GET /api/v1/jobs/{jobId}/trace': ['200', '400', '401', '404'],
  'GET /api/v1/jobs/{jobId}/trace/{entryId}': ['200', '401', '403', '404', '413'],
  'POST /api/v1/artifacts': ['201', '400', '401', '413'],
  'GET /api/v1/artifacts/{artifactId}': ['200', '401', '404'],
  'POST /api/v1/requirements/versions': ['201', '400', '401', '404', '409'],
  'GET /api/v1/requirements/versions/{versionId}': ['200', '401', '404'],
  'GET /api/v1/jobs/{jobId}/requirements/versions': ['200', '401', '404'],
};

test('OpenAPI v1 contract declares all required operations and responses', () => {
  assert.equal(spec.openapi, '3.1.0');
  for (const [id, responseCodes] of Object.entries(requiredOperations)) {
    const [method, endpoint] = id.split(' ');
    const operation = spec.paths?.[endpoint]?.[method.toLowerCase()];
    assert.ok(operation, `${id} must be defined`);
    assert.ok(operation.operationId, `${id} must define operationId`);
    for (const code of responseCodes) assert.ok(operation.responses?.[code], `${id} must define ${code}`);
  }
});

test('OpenAPI v1 contract keeps the control plane reference-only', () => {
  const createJob = spec.components.schemas.CreateJobRequest;
  assert.ok(createJob.required.includes('inputArtifactId'));
  assert.equal(createJob.properties.input, undefined);
  assert.equal(spec.components.schemas.Artifact.properties.size.maximum, 104857600);
});

test('OpenAPI v1 declares lifecycle and partial-result contracts', () => {
  const statuses = spec.components.schemas.JobStatus.enum;
  for (const expected of ['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED']) {
    assert.ok(statuses.includes(expected));
  }
  assert.ok(spec.components.schemas.JobOutcome.enum.includes('PARTIAL'));
  assert.ok(spec.components.schemas.JobResult.properties.modelAttempts);
  assert.ok(spec.components.schemas.JobTrace.properties.timeline);
  assert.ok(spec.components.schemas.RequirementsVersion.required.includes('requirements'));
  assert.equal(spec.components.schemas.RequirementItem.properties.researchEnhancementKey.maxLength, 200);
});

test('jobId remains the only durable identifier and no parallel task API is introduced', () => {
  assert.equal(spec.components.schemas.Job.properties.taskId, undefined);
  assert.equal(spec.components.schemas.JobAccepted.properties.taskId, undefined);
  assert.equal(Object.keys(spec.paths).some((path) => path.startsWith('/api/v1/tasks')), false);
  assert.equal(spec.components.schemas.JobTrace.properties.jobId.format, 'uuid');
});

test('domain contracts expose product options and strict mutually exclusive inputs', () => {
  assert.equal(spec.components.schemas.DecompositionRequest.oneOf.length, 2);
  assert.equal(spec.components.schemas.StandaloneResearchRequest.oneOf.length, 2);
  assert.deepEqual(spec.components.schemas.StandaloneResearchRequest.oneOf[0].properties.strategy.enum, ['standard', 'agent']);
  assert.equal(spec.components.schemas.RequirementsResearchRequest.additionalProperties, false);
  assert.ok(spec.components.schemas.JobOptions.properties.promptVersion);
  for (const field of ['statusUrl', 'eventsUrl', 'resultUrl', 'cancelUrl']) assert.ok(spec.components.schemas.JobAccepted.properties[field]);
});
