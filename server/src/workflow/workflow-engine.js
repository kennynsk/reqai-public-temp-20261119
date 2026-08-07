export const WORKFLOW_ENGINE_OPERATIONS = Object.freeze(['start', 'signal', 'cancel', 'retry', 'reset', 'getExecution', 'close']);

export function assertWorkflowEngine(engine) {
  for (const operation of WORKFLOW_ENGINE_OPERATIONS) {
    if (typeof engine?.[operation] !== 'function') throw new TypeError(`WorkflowEngine.${operation} must be implemented`);
  }
  return engine;
}

export function workflowIdForJob(jobId) {
  return `reqai-job-${jobId}`;
}
