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
  'POST /api/v1/requirements/versions/{versionId}/research': ['202', '400', '401', '403', '404', '409', '429', '503'],
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
  'GET /api/v1/requirements/versions/{versionId}/export': ['200', '400', '401', '404'],
  'GET /api/v1/jobs/{jobId}/requirements/versions': ['200', '401', '404'],
  'POST /api/v1/jobs/{jobId}/discussions': ['201', '400', '401', '403', '404'],
  'GET /api/v1/jobs/{jobId}/discussions/{anchorId}': ['200', '401', '403', '404'],
  'GET /api/v1/jobs/{jobId}/discussions/{anchorId}/events': ['200', '401', '403', '404'],
  'POST /api/v1/jobs/{jobId}/discussions/{anchorId}/messages': ['202', '400', '401', '403', '404', '409', '413', '502'],
  'POST /api/v1/jobs/{jobId}/discussions/attempts/{attemptId}/retry': ['202', '401', '403', '404', '409'],
  'POST /api/v1/jobs/{jobId}/discussions/attempts/{attemptId}/cancel': ['202', '401', '403', '404', '409'],
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
  assert.equal(spec.paths['/api/v1/jobs'].post, undefined);
  assert.equal(spec.components.schemas.CreateJobRequest, undefined);
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
  assert.equal(spec.paths['/api/v1/research'], undefined);
  assert.equal(spec.components.schemas.StandaloneResearchRequest, undefined);
  assert.deepEqual(spec.components.schemas.FeatureMode.enum, ['DECOMPOSITION', 'REQUIREMENTS_INSIGHTS']);

  assert.equal(spec.components.schemas.Job.properties.mode.type.includes('string'), true);
  assert.equal(spec.components.schemas.RequirementsResearchRequest.additionalProperties, false);
  assert.ok(spec.components.schemas.JobOptions.properties.promptVersion);
  assert.deepEqual(spec.components.schemas.ReasoningLevel.enum, ['disabled', 'low', 'high', 'max']);
  assert.equal(spec.components.schemas.JobOptions.properties.reasoning.$ref, '#/components/schemas/ReasoningLevel');
  for (const field of ['statusUrl', 'eventsUrl', 'resultUrl', 'cancelUrl']) assert.ok(spec.components.schemas.JobAccepted.properties[field]);
});
