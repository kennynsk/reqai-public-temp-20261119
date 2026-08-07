import { randomUUID } from 'node:crypto';

import { classifyProviderError } from './provider-error.js';

function extractText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n');
  if (typeof content?.text === 'string') return content.text;
  throw new Error('Provider response has no text content');
}

export class ZaiProvider {
  constructor({ apiKey, baseUrl, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async complete({ model, messages, temperature, timeoutMs, requestId = randomUUID() }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({ model, messages, temperature, stream: false }),
        signal: controller.signal,
      });
      const providerRequestId = response.headers?.get?.('x-request-id') || response.headers?.get?.('request-id') || requestId;
      if (!response.ok) {
        const error = new Error(`ZAI request failed with HTTP ${response.status}`);
        error.status = response.status;
        error.requestId = providerRequestId;
        throw error;
      }
      const data = await response.json();
      return {
        text: extractText(data).trim(),
        model: data?.model || model,
        requestId: data?.id || providerRequestId,
        usage: {
          inputTokens: Number(data?.usage?.prompt_tokens ?? 0),
          outputTokens: Number(data?.usage?.completion_tokens ?? 0),
        },
      };
    } catch (error) {
      throw classifyProviderError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}
