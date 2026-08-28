export function reasoningLevels(model, capabilities = {}) {
  return capabilities[model]?.reasoningLevels || (['glm-5.3', 'glm-5.3-flash'].includes(model) ? ['low', 'high', 'max'] : ['disabled', 'low', 'high', 'max']);
}
export function effectiveReasoning(model, selected, capabilities = {}) {
  const levels = reasoningLevels(model, capabilities);
  return levels.includes(selected) ? selected : capabilities[model]?.defaultReasoning || levels[0];
}
export function readNextSettings(scope, models, capabilities) {
  let saved;
  try { saved = scope && JSON.parse(localStorage.getItem(`reqai.nextAiSettings:${scope}`)); } catch { /* optional preference */ }
  const model = models.includes(saved?.model) ? saved.model : models[0];
  return { model, reasoning: effectiveReasoning(model, saved?.reasoning, capabilities), temperature: Number.isFinite(saved?.temperature) && saved.temperature >= 0 && saved.temperature <= 2 ? saved.temperature : 0.2 };
}
