import { randomUUID } from 'node:crypto';
import { Agent } from 'undici';

import { classifyProviderError } from './provider-error.js';
import { FORCED_REASONING_MODELS } from '../domain/model-capabilities.js';

function extractText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n');
  if (typeof content?.text === 'string') return content.text;
  throw new Error('Provider response has no text content');
}

const REASONING_EFFORTS = new Set(['low', 'high', 'max']);

function resolveReasoning({ model, thinking, reasoning }) {
  const selected = reasoning ?? thinking;
  if (FORCED_REASONING_MODELS.has(model)) {
    if (selected === 'disabled' || selected == null) return { thinking: 'enabled', reasoningEffort: 'low' };
    if (REASONING_EFFORTS.has(selected)) return { thinking: 'enabled', reasoningEffort: selected };
    return { thinking: 'enabled' };
  }
  if (selected === 'disabled') return { thinking: 'disabled' };
  if (REASONING_EFFORTS.has(selected)) return { thinking: 'enabled', reasoningEffort: selected };
  return { thinking: selected === 'enabled' ? 'enabled' : thinking };
}

export class ZaiProvider {
  constructor({ apiKey, baseUrl, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async complete({ model, messages, temperature, maxOutputTokens, jsonObject, thinking, reasoning, timeoutMs, signal, requestId = randomUUID() }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
    const effectiveReasoning = resolveReasoning({ model, thinking, reasoning });
    try {
      signal?.throwIfAborted();
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          ...(Number.isInteger(maxOutputTokens) ? { max_tokens: maxOutputTokens } : {}),
          ...(effectiveReasoning.thinking ? { thinking: { type: effectiveReasoning.thinking } } : {}),
          ...(effectiveReasoning.reasoningEffort ? { reasoning_effort: effectiveReasoning.reasoningEffort } : {}),
          ...(jsonObject ? { response_format: { type: 'json_object' } } : {}),
          stream: false,
        }),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        dispatcher,
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
      if (signal?.aborted) throw signal.reason;
      throw classifyProviderError(error, { requestId });
    } finally {
      clearTimeout(timer);
      await (signal?.aborted || controller.signal.aborted ? dispatcher.destroy() : dispatcher.close()).catch(() => {});
    }
  }
}
