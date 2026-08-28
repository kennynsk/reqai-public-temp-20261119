import { expect, test } from 'vitest';
import { effectiveReasoning, reasoningLevels } from './ai-settings.js';
test('GLM forced reasoning uses low, and server capabilities override client fallbacks', () => {
  expect(reasoningLevels('glm-5.3-flash')).not.toContain('disabled');
  expect(effectiveReasoning('glm-5.3-flash', 'disabled')).toBe('low');
  expect(effectiveReasoning('glm-5.3-flash', 'high')).toBe('high');
  expect(effectiveReasoning('other', 'disabled')).toBe('disabled');
  expect(effectiveReasoning('other', 'disabled', { other: { reasoningLevels: ['high'], defaultReasoning: 'high' } })).toBe('high');
});
