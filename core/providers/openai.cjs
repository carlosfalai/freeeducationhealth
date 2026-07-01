'use strict';

/**
 * OpenAI provider adapter.
 *
 * Bring-your-own credentials: set the environment variable named by
 * `providerConfig.apiKeyEnvVar` (default "OPENAI_API_KEY") to your own
 * OpenAI API key. Uses the chat-completions endpoint for broad model
 * compatibility.
 *
 * @see https://platform.openai.com/docs/api-reference/chat
 */

const { resolveApiKey, fetchWithTimeout, readJsonOrThrow } = require('./_shared.cjs');

const PROVIDER_NAME = 'openai';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * @typedef {import('./anthropic.cjs').ProviderPrompt} ProviderPrompt
 * @typedef {import('./anthropic.cjs').ProviderConfig} ProviderConfig
 */

/**
 * Call OpenAI with a system + user prompt and return its plain-text reply.
 *
 * @param {ProviderPrompt} prompt
 * @param {ProviderConfig} [providerConfig]
 * @returns {Promise<string>} raw text of the model's reply
 */
async function callOpenAI(prompt, providerConfig = {}) {
  const { systemPrompt, userPrompt } = prompt || {};
  const {
    model = DEFAULT_MODEL,
    apiKeyEnvVar = 'OPENAI_API_KEY',
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

module.exports = callOpenAI;
module.exports.providerName = PROVIDER_NAME;
