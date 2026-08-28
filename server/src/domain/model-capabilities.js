export const FORCED_REASONING_MODELS = new Set(['glm-5.3', 'glm-5.3-flash']);

export function modelCapabilities(model) {
  const forced = FORCED_REASONING_MODELS.has(model);
  return { reasoningLevels: forced ? ['low', 'high', 'max'] : ['disabled', 'low', 'high', 'max'], defaultReasoning: forced ? 'low' : 'disabled', disabledMapsTo: forced ? 'low' : 'disabled' };
}

export function executionSettingsSnapshot({ model, reasoning, temperature }) {
  return { requestedModel: model, requestedReasoning: reasoning, effectiveReasoning: FORCED_REASONING_MODELS.has(model) && (reasoning == null || reasoning === 'disabled') ? 'low' : reasoning, temperature };
}
