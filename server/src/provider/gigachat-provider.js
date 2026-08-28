import { randomUUID } from 'node:crypto';

import { classifyProviderError } from './provider-error.js';

function extractText(response) {
  const content = response?.choices?.[0]?.message?.content ?? response?.data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n');
  if (typeof content?.text === 'string') return content.text;
  throw new Error('Provider response has no text content');
}

export class GigaChatProvider {
  constructor(client, { modelAliases = {} } = {}) { this.client = client; this.modelAliases = modelAliases; }

  async complete({ model, messages, temperature, maxOutputTokens, timeoutMs, requestId = randomUUID(), traceContext = {} }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.client.chat({ model: this.modelAliases[model] || model, messages, temperature, ...(Number.isInteger(maxOutputTokens) ? { max_tokens: maxOutputTokens } : {}), signal: controller.signal, requestId, metadata: traceContext });
      return {
        text: extractText(response).trim(),
        model: response?.model || response?.data?.model || model,
        requestId: response?.id || response?.data?.id || requestId,
        usage: {
          inputTokens: Number(response?.usage?.prompt_tokens ?? response?.data?.usage?.prompt_tokens ?? 0),
          outputTokens: Number(response?.usage?.completion_tokens ?? response?.data?.usage?.completion_tokens ?? 0),
        },
      };
    } catch (error) {
      throw classifyProviderError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}
