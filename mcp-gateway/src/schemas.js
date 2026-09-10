import * as z from 'zod/v4';

const uuid = z.string().uuid();
const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{16,128}$/);
const promptVersion = z.string().regex(/^[1-9]\d*\.\d+\.\d+$/);
const model = z.string().trim().min(1).max(128);
const temperature = z.number().min(0).max(2);
const reasoning = z.enum(['disabled', 'low', 'high', 'max']);
const artifactInput = {
  businessContext: z.string().trim().min(1).max(1_048_576).optional(),
  inputArtifactId: uuid.optional(),
  baselineArtifactId: uuid.optional(),
  referenceArtifactIds: z.array(uuid).max(20).refine((items) => new Set(items).size === items.length, { message: 'referenceArtifactIds must not contain duplicates' }).optional(),
};
const execution = {
  model: model.optional(),
  temperature: temperature.optional(),
  reasoning: reasoning.optional(),
  promptVersion: promptVersion.optional(),
};

function exactlyOneInput(schema, inlineField) {
  return schema.refine((value) => Boolean(value[inlineField]) !== Boolean(value.inputArtifactId), {
    message: `Exactly one of ${inlineField} or inputArtifactId is required`,
  });
}

export const decomposeRequirementsInput = exactlyOneInput(z.strictObject({
  idempotencyKey,
  ...artifactInput,
  ...execution,
}), 'businessContext');

export const researchRequirementsInput = z.strictObject({
  idempotencyKey,
  versionId: uuid,
  ...execution,
});

export const uploadArtifactInput = z.strictObject({
  content: z.string().min(1).max(262_144).refine((value) => Buffer.byteLength(value, 'utf8') <= 262_144, { message: 'content must not exceed 262144 UTF-8 bytes' }),
  contentType: z.enum(['text/plain', 'text/markdown', 'application/json']).optional().default('text/plain'),
});
export const artifactOutput = z.strictObject({
  artifactId: uuid, size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentType: z.string(), createdAt: z.string(),
});

export const taskInput = z.strictObject({ jobId: uuid });

const nullableString = z.string().nullable();
const stepId = z.string().min(1).max(256);
export const acceptedJobOutput = z.strictObject({
  jobId: uuid,
  status: z.string(),
  statusUrl: z.string(),
  eventsUrl: z.string(),
  resultUrl: z.string(),
  cancelUrl: z.string(),
  idempotencyReplayed: z.boolean(),
});

export const taskStatusOutput = z.strictObject({
  jobId: uuid,
  parentJobId: uuid.nullable(),
  inputArtifactId: uuid,
  type: z.enum(['DECOMPOSITION', 'RESEARCH']),
  mode: nullableString,
  status: z.enum(['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED']),
  outcome: nullableString,
  reasonCode: nullableString.optional(),
  progress: z.number(),
  currentStep: nullableString,
  message: nullableString,
  resultArtifactId: uuid.nullable(),
  createdAt: z.string(),
  startedAt: nullableString,
  completedAt: nullableString,
  updatedAt: z.string(),
});

export const taskResultOutput = z.strictObject({
  jobId: uuid,
  parentJobId: uuid.nullable(),
  inputArtifactId: uuid,
  type: z.enum(['DECOMPOSITION', 'RESEARCH']),
  status: z.literal('SUCCEEDED'),
  outcome: nullableString,
  reasonCode: nullableString.optional(),
  mode: nullableString,
  summary: nullableString,
  resultArtifactId: uuid.nullable(),
  resultContentUrl: nullableString,
  failedSteps: z.array(z.strictObject({ stepId, stepType: z.string(), summary: nullableString })),
  modelAttempts: z.array(z.strictObject({
    stepId,
    requestedModel: z.string(),
    model: z.string(),
    executionId: uuid.nullable().optional(),
    attempt: z.number(),
    result: z.string(),
    reasonCode: nullableString,
    tokenUsage: z.strictObject({ input: z.number(), output: z.number() }).nullable(),
    durationMs: z.number().nullable(),
  })),
});

const resultContentFormat = z.enum(['markdown', 'raw']);
export const taskResultContentInput = z.strictObject({
  jobId: uuid,
  format: resultContentFormat.optional().default('markdown'),
});

export const taskResultContentOutput = z.strictObject({
  jobId: uuid,
  format: resultContentFormat,
  contentType: z.string().trim().min(1).max(256),
  content: z.string().max(1_000_000),
});

export const errorOutput = z.strictObject({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  requestId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).optional(),
});

function toolOutput(successSchema) {
  return successSchema.partial().extend({ error: errorOutput.optional() });
}

export const TOOL_DEFINITIONS = Object.freeze({
  decompose_requirements: { inputSchema: decomposeRequirementsInput, outputSchema: toolOutput(acceptedJobOutput), successSchema: acceptedJobOutput, description: 'Start asynchronous requirements decomposition.' },
  research_requirements: { inputSchema: researchRequirementsInput, outputSchema: toolOutput(acceptedJobOutput), successSchema: acceptedJobOutput, description: 'Start asynchronous research for an immutable requirements version.' },
  get_task_status: { inputSchema: taskInput, outputSchema: toolOutput(taskStatusOutput), successSchema: taskStatusOutput, description: 'Read canonical ReqAI task status.' },
  get_task_result: { inputSchema: taskInput, outputSchema: toolOutput(taskResultOutput), successSchema: taskResultOutput, description: 'Read canonical ReqAI task result metadata.' },
  upload_artifact: { inputSchema: uploadArtifactInput, outputSchema: toolOutput(artifactOutput), successSchema: artifactOutput, description: 'Upload UTF-8 text, Markdown or JSON material (up to 256 KiB). Returns artifactId for primary, baseline or reference input. Pass content, never a local path or URL. Repeating an upload may create another artifact.' },
  cancel_task: { inputSchema: taskInput, outputSchema: toolOutput(taskStatusOutput), successSchema: taskStatusOutput, description: 'Request cancellation of a task. Poll get_task_status until terminal; cancellation may race with completion and does not undo provider usage.' },
  get_task_result_content: { inputSchema: taskResultContentInput, outputSchema: toolOutput(taskResultContentOutput), successSchema: taskResultContentOutput, description: 'Read the full human-readable result content after a task succeeds.' },
});
