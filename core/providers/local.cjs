'use strict';

/**
 * Generic OpenAI-compatible local-model provider adapter (Ollama, LM
 * Studio, vLLM's OpenAI-compatible server, etc).
 *
 * Unlike the hosted providers, this one usually needs no API key -- local
 * inference servers typically don't require auth. `baseUrl` is required
 * (either via `providerConfig.baseUrl` or the `LOCAL_MODEL_BASE_URL`
 * environment variable) since there's no fixed public endpoint to default
 * to. Point it at your own machine, e.g. "http://localhost:11434/v1" for
 * Ollama or "http://localhost:1234/v1" for LM Studio.
 *
 * If your local server does require a bearer token, set
 * `providerConfig.apiKeyEnvVar` and it will be sent as
 * `Authorization: Bearer <value>`.
 */

const { fetchWithTimeout, readJsonOrThrow } = require('./_shared.cjs');

const PROVIDER_NAME = 'local';
const DEFAULT_MODEL = 'llama3';

/**
 * @typedef {import('./anthropic.cjs').ProviderPrompt} ProviderPrompt
 * @typedef {import('./anthropic.cjs').ProviderConfig} ProviderConfig
 */

/**
 * Call a local/self-hosted OpenAI-compatible model and return its
 * plain-text reply.
 *
 * @param {ProviderPrompt} prompt
 * @param {ProviderConfig} [providerConfig]
 * @returns {Promise<string>} raw text of the model's reply
 */
async function callLocal(prompt, providerConfig = {}) {
  const { systemPrompt, userPrompt } = prompt || {};
  const {
    model = DEFAULT_MODEL,
    baseUrl,
    apiKeyEnvVar,
    maxTokens = 1500,
    temperature = 0.2,
  } = providerConfig;

  const resolvedBaseUrl = baseUrl || process.env.LOCAL_MODEL_BASE_URL;
  if (!resolvedBaseUrl) {
    throw new Error(
      `[core/providers/${PROVIDER_NAME}] no baseUrl configured. Set PanelConfig.providers[].baseUrl ` +
        `(or the LOCAL_MODEL_BASE_URL environment variable) to your own Ollama/LM Studio endpoint, ` +
        `e.g. "http://localhost:11434/v1".`
    );
  }

  const headers = { 'content-type': 'application/json' };
  const apiKey = apiKeyEnvVar ? process.env[apiKeyEnvVar] : undefined;
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const endpoint = `${resolvedBaseUrl.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const data = await readJsonOrThrow(response, PROVIDER_NAME);
  const text = data?.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error(
      `[core/providers/${PROVIDER_NAME}] empty response from local model "${model}" at ${endpoint}`
    );
  }
  return text;
}

module.exports = callLocal;
module.exports.providerName = PROVIDER_NAME;
