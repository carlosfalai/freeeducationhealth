'use strict';

/**
 * DeepSeek provider adapter.
 *
 * Bring-your-own credentials: set the environment variable named by
 * `providerConfig.apiKeyEnvVar` (default "DEEPSEEK_API_KEY") to your own
 * DeepSeek API key. DeepSeek's API is OpenAI-chat-completions-compatible,
 * so this adapter's request/response shape mirrors openai.cjs.
 *
 * @see https://api-docs.deepseek.com/
 */

const { resolveApiKey, fetchWithTimeout, readJsonOrThrow } = require('./_shared.cjs');

const PROVIDER_NAME = 'deepseek';
const DEFAULT_BASE_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

/**
 * @typedef {import('./anthropic.cjs').ProviderPrompt} ProviderPrompt
 * @typedef {import('./anthropic.cjs').ProviderConfig} ProviderConfig
 */

/**
 * Call DeepSeek with a system + user prompt and return its plain-text reply.
 *
 * @param {ProviderPrompt} prompt
 * @param {ProviderConfig} [providerConfig]
 * @returns {Promise<string>} raw text of the model's reply
 */
async function callDeepseek(prompt, providerConfig = {}) {
  const { systemPrompt, userPrompt } = prompt || {};
  const {
    model = DEFAULT_MODEL,
    apiKeyEnvVar = 'DEEPSEEK_API_KEY',
    baseUrl = DEFAULT_BASE_URL,
    maxTokens = 1500,
    temperature = 0.2,
  } = providerConfig;

  const apiKey = resolveApiKey(apiKeyEnvVar, PROVIDER_NAME);

  const response = await fetchWithTimeout(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
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
    throw new Error(`[core/providers/${PROVIDER_NAME}] empty response body from model "${model}"`);
  }
  return text;
}

module.exports = callDeepseek;
module.exports.providerName = PROVIDER_NAME;
