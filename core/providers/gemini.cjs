'use strict';

/**
 * Google Gemini provider adapter.
 *
 * Bring-your-own credentials: set the environment variable named by
 * `providerConfig.apiKeyEnvVar` (default "GEMINI_API_KEY") to your own
 * Google AI Studio API key (https://aistudio.google.com/apikey). Uses the
 * Generative Language `generateContent` endpoint.
 *
 * Kept deliberately parallel to the other adapters: one system + user
 * prompt in, one plain-text reply out, same timeout/error plumbing from
 * _shared.cjs. Gemini's request shape differs from the OpenAI-compatible
 * providers (system text goes in `systemInstruction`, the user turn in
 * `contents`, and the key travels as a query param), which is the only
 * reason this is its own file rather than another openai-compatible entry.
 *
 * @see https://ai.google.dev/api/generate-content
 */

const { resolveApiKey, fetchWithTimeout, readJsonOrThrow } = require('./_shared.cjs');

const PROVIDER_NAME = 'gemini';
// Base URL WITHOUT the model segment or `:generateContent` suffix -- those
// are appended per call so a self-hoster can point `baseUrl` at a proxy
// without having to encode the model into it.
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * @typedef {import('./anthropic.cjs').ProviderPrompt} ProviderPrompt
 * @typedef {import('./anthropic.cjs').ProviderConfig} ProviderConfig
 */

/**
 * Call Gemini with a system + user prompt and return its plain-text reply.
 *
 * @param {ProviderPrompt} prompt
 * @param {ProviderConfig} [providerConfig]
 * @returns {Promise<string>} raw text of the model's reply
 */
async function callGemini(prompt, providerConfig = {}) {
  const { systemPrompt, userPrompt } = prompt || {};
  const {
    model = DEFAULT_MODEL,
    apiKeyEnvVar = 'GEMINI_API_KEY',
    baseUrl = DEFAULT_BASE_URL,
    maxTokens = 1500,
    temperature = 0.2,
  } = providerConfig;

  const apiKey = resolveApiKey(apiKeyEnvVar, PROVIDER_NAME);

  const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(model)}:generateContent`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Key as a header (supported alongside ?key=) so it never lands in
      // request-URL logs.
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: systemPrompt
        ? { parts: [{ text: systemPrompt }] }
        : undefined,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  const data = await readJsonOrThrow(response, PROVIDER_NAME);
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => p?.text || '').join('').trim()
    : '';

  if (!text) {
    // A blocked prompt returns candidates with a finishReason but no text --
    // surface that rather than a bare "empty response".
    const finish = data?.candidates?.[0]?.finishReason;
    const blocked = data?.promptFeedback?.blockReason;
    const detail = blocked
      ? ` (prompt blocked: ${blocked})`
      : finish
        ? ` (finishReason: ${finish})`
        : '';
    throw new Error(
      `[core/providers/${PROVIDER_NAME}] empty response body from model "${model}"${detail}`
    );
  }
  return text;
}

module.exports = callGemini;
module.exports.providerName = PROVIDER_NAME;
