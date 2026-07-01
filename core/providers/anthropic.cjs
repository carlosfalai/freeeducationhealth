'use strict';

/**
 * Anthropic (Claude) provider adapter.
 *
 * Bring-your-own credentials: set the environment variable named by
 * `providerConfig.apiKeyEnvVar` (default "ANTHROPIC_API_KEY") to your own
 * Anthropic API key. This module talks directly to api.anthropic.com (or
 * `providerConfig.baseUrl` if you're pointing at a compatible proxy) and
 * never hardcodes a key.
 *
 * @see https://docs.anthropic.com/en/api/messages
 */

const { resolveApiKey, fetchWithTimeout, readJsonOrThrow } = require('./_shared.cjs');

const PROVIDER_NAME = 'anthropic';
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * @typedef {object} ProviderPrompt
 * @property {string} systemPrompt - Persona/style-guide + task instructions.
 * @property {string} userPrompt - The intake-derived clinical prompt.
 */

/**
 * @typedef {object} ProviderConfig
 * @property {string} [model] - Model id, e.g. "claude-sonnet-5".
 * @property {string} [apiKeyEnvVar] - Env var holding the API key.
 * @property {string} [baseUrl] - Override endpoint (self-hosted proxy, etc).
 * @property {number} [maxTokens]
 * @property {number} [temperature]
 */

/**
 * Call Claude with a system + user prompt and return its plain-text reply.
 *
 * @param {ProviderPrompt} prompt
 * @param {ProviderConfig} [providerConfig]
 * @returns {Promise<string>} raw text of the model's reply
 */
async function callAnthropic(prompt, providerConfig = {}) {
  const { systemPrompt, userPrompt } = prompt || {};
  const {
    model = DEFAULT_MODEL,
    apiKeyEnvVar = 'ANTHROPIC_API_KEY',
    baseUrl = DEFAULT_BASE_URL,
    maxTokens = 1500,
    temperature = 0.2,
  } = providerConfig;

  const apiKey = resolveApiKey(apiKeyEnvVar, PROVIDER_NAME);

  const response = await fetchWithTimeout(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await readJsonOrThrow(response, PROVIDER_NAME);
  const text = Array.isArray(data.content)
    ? data.content
        .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
        .join('\n')
        .trim()
    : '';

  if (!text) {
    throw new Error(`[core/providers/${PROVIDER_NAME}] empty response body from model "${model}"`);
  }
  return text;
}

module.exports = callAnthropic;
module.exports.providerName = PROVIDER_NAME;
